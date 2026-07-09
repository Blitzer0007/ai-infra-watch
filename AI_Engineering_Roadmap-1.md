# AI Engineering Roadmap: Hybrid AI QA + Builder

> From Automation QA Engineer to AI Engineer who builds AND validates AI systems

**Starting point**: Automation QA Engineer (Playwright, TypeScript), Python basics, built ai-infra-watch (Gemini API)
**Time commitment**: 3-4 hours/day
**Timeline**: ~28 weeks (7 months)
**Target role**: Hybrid AI QA Engineer + AI Builder — someone who builds AI systems (RAG, Agents, MCP, Multi-Agent Orchestration, LangChain, LangGraph) AND knows how to rigorously test/evaluate them

---

## Why This Hybrid Role Is Powerful

Most AI engineers **can't test their own systems properly.** They build a RAG pipeline, eyeball a few outputs, and ship. Then it hallucinates in production.

Most QA engineers **don't understand AI internals well enough** to write meaningful evaluations. They try to apply deterministic testing to non-deterministic systems and get frustrated.

You'll be the person who **builds it right AND proves it works.** That's rare and valuable.

Your QA background gives you:
- Systematic thinking about edge cases and failure modes
- Test automation skills (Playwright transfers to AI eval automation)
- Understanding of CI/CD pipelines (critical for prompt regression testing)
- Experience with assertion patterns (adapts to LLM output validation)
- API testing experience (LLM APIs are just APIs with non-deterministic responses)

---

## How This Roadmap Works

Each phase has four parallel tracks:

| Track | Purpose |
|-------|---------|
| **Learn** | Theory, concepts, documentation |
| **Build** | Standalone project demonstrating the skill |
| **Test** | Evaluation/validation technique for what you built |
| **Enhance** | Apply to ai-infra-watch (real-world context) |

Phases are sequential — each builds on the previous. Don't skip ahead.

---

## Structured Courses (Company-Sponsored + Anthropic Official)

Complete these FIRST before diving into hands-on project building. These give you the theoretical foundation in ~26 hours of focused coursework (~7-8 days at 3-4 hours/day).

### Perficient LinkedIn Learning Path: Agentic SDLC

| # | Course | Duration | Maps to Phase |
|---|--------|----------|---------------|
| 1 | The AI Ecosystem for Developers: Models, Datasets, and APIs | 3h 31m | Phase 0 |
| 2 | Generative AI: Introduction to Large Language Models | 1h 36m | Phase 0-1 |
| 3 | Applied AI: Getting Started with Hugging Face Transformers | 1h 14m | Phase 1 |
| 4 | Hands-On AI: Building Your First LLM-Powered App | 1h 14m | Phase 1 |
| 5 | Complete Guide to Evaluating Large Language Models (LLMs) | 7h 56m | Phase 1-2 (QA CORE) |
| 6 | Build with AI: Reasoning Models for AI Agents | 15m | Phase 4 |
| 7 | Build AI Agents and Chatbots with LangGraph | 1h 14m | Phase 4 |
| 8 | Build with AI: Autonomous Agents with LangChain and Hugging Face | 1h 20m | Phase 4 |
| 9 | Build with AI: Agentic Applications with LlamaIndex and MCP | ~1h | Phase 5 |
| 10 | Local AI: Build a RAG Model from Scratch with Open-Source Tools | 2h 21m | Phase 2 |
| 11 | Hands-On AI: Introduction to Retrieval-Augmented Generation (RAG) | 39m | Phase 2 |
| 12 | Building AI-Powered Browser Agents with Playwright and LLMs | 47m | Phase 5 (YOUR KEY COURSE) |
| 13 | Agentic AI and Autonomous Development | 59m | Phase 4-5 |
| 14 | Operating AI Agents: Failure and Recovery | ~42m | Phase 7 |

### Anthropic Official Courses (LinkedIn Learning)

| # | Course | Duration | Maps to Phase | Priority |
|---|--------|----------|---------------|----------|
| 1 | Claude Code in Action by Anthropic | 1h 10m | Phase 1 (tooling) | Do first — you use this daily |
| 2 | Building with the Claude API by Anthropic | 8h 11m | Phase 1 (API, tool calling, streaming) | HIGHEST VALUE — this IS Phase 1 |
| 3 | Introduction to Model Context Protocol by Anthropic | 1h 1m | Phase 5 (MCP) | Essential — straight from MCP creators |
| 4 | Model Context Protocol: Advanced Topics by Anthropic | ~1h | Phase 5 (MCP servers, advanced) | Follow-up to MCP intro |

### Recommended Completion Order

```
Week 1:     The AI Ecosystem for Developers (3h 31m) — concepts first
            Generative AI: Intro to LLMs (1h 36m) — understand what LLMs are
Week 2:     Claude Code in Action (1h 10m) — understand your daily tool
            Building with Claude API (start — 4h) — hands-on API usage
Week 3:     Building with Claude API (finish — 4h)
            Applied AI: Hugging Face Transformers (1h 14m)
            Hands-On AI: Building First LLM App (1h 14m)
Week 4:     Complete Guide to Evaluating LLMs (start — 4h) — QA CORE
            (need to understand LLMs before you can evaluate them)
Week 5:     Complete Guide to Evaluating LLMs (finish — 4h)
            RAG courses: Local AI + Intro to RAG (3h)
Week 6:     LangGraph + Agents courses (3h 48m)
            Reasoning Models for AI Agents (15m)
Week 7:     MCP: Intro + Advanced by Anthropic (2h) — need agent context first
            Agentic Apps with LlamaIndex and MCP (1h)
            Playwright + LLMs (47m) — needs MCP understanding
            Operating AI Agents: Failure and Recovery (42m)
Week 8+:    Start building Portfolio Project #1
```

**Why this order matters**:
- Foundations FIRST (Week 1) — you need concepts before API usage
- Build with APIs (Week 2-3) — understand LLMs by using them
- Evaluate LLMs (Week 4-5) — can't evaluate what you don't understand
- RAG after LLM basics (Week 5) — RAG uses LLMs, so LLM knowledge is prerequisite
- Agents after RAG (Week 6) — agents often use RAG as a tool
- MCP after Agents (Week 7) — MCP connects agents to tools, need agent context first
- Playwright + LLMs last in courses (Week 7) — combines everything above

**Total coursework: ~33 hours | Completion: ~7 weeks at 1-1.5 hours/day (alongside work) or ~3 weeks at 3-4 hours/day (dedicated)**

After completing these courses, you'll have the theoretical foundation for Phases 0-5. The remaining roadmap phases focus on BUILDING (portfolio projects) and DEPTH (testing strategies, advanced patterns) that courses alone can't teach.

---

## Phase 0: Foundations (Weeks 1-2)

### Goal
Bridge from QA automation skills to AI engineering prerequisites.

### Learn

**Python for AI** (your TypeScript transfers, but Python is the AI ecosystem language):
- Async/await patterns (critical for API calls and streaming)
- Type hints and Pydantic models (used everywhere in LangChain/LangGraph)
- Generators and iterators (streaming token-by-token responses)
- Decorators (used in tool definitions)
- Virtual environments and dependency management (poetry or uv)
- pytest (the AI testing ecosystem lives here, not Jest)

**Conceptual foundations**:
- What embeddings are: text → fixed-size number array representing meaning
- Cosine similarity: how to measure "closeness" of meaning between texts
- Tokens: how LLMs see text (not words, not characters — subword pieces)
- Context windows: the memory limit of a single LLM call
- Temperature: randomness control in generation
- Non-determinism: same input can produce different outputs (fundamental shift from traditional testing)

**Mapping QA concepts to AI**:
| Traditional QA | AI QA Equivalent |
|----------------|-----------------|
| Assertions (exact match) | Semantic similarity, LLM-as-judge |
| Test data | Evaluation datasets (golden answers) |
| Regression tests | Prompt regression testing |
| Code coverage | Evaluation coverage (scenarios, edge cases) |
| Unit tests | Component evals (retriever accuracy, LLM accuracy) |
| Integration tests | End-to-end eval (full pipeline quality) |
| Performance testing | Latency, token usage, cost per query |
| Bug reports | Hallucination reports, failure mode analysis |

**SQL & Data Validation** (still required in most AI QA roles):
- SQL fundamentals: SELECT, JOIN, GROUP BY, window functions
- Data pipeline validation: verify data feeding AI models is clean and complete
- Schema validation: ensure input data matches expected structure
- Data quality checks: nulls, duplicates, outliers, freshness
- Why this matters for AI QA: "Garbage in → garbage out." If training data or RAG documents are corrupted, the AI will produce bad outputs regardless of model quality. You validate the data layer.

**Docker basics** (running AI test environments):
- What containers are: isolated, reproducible environments
- Dockerfile: define your test environment
- docker-compose: spin up multiple services (vector DB + API + app) for testing
- Key commands: `docker build`, `docker run`, `docker-compose up`
- Use cases for AI QA:
  - Run ChromaDB locally for RAG testing
  - Spin up MCP servers in containers
  - Reproducible test environments (same results on your machine and CI)
  - Isolate AI system components for testing

**API patterns**:
- REST API consumption (requests, httpx)
- Server-Sent Events (SSE) for streaming
- Rate limiting and retry strategies (exponential backoff)

### Resources
- **[LinkedIn] The AI Ecosystem for Developers** (Perficient path — covers models, datasets, APIs)
- **[LinkedIn] Generative AI: Introduction to LLMs** (Perficient path — LLM foundations)
- Python async: Real Python's async/await tutorial
- Pydantic: docs.pydantic.dev (v2)
- pytest: docs.pytest.org (focus on fixtures, parametrize, markers)
- Embeddings intuition: "What Are Word Embeddings" by Jay Alammar
- SQL: Mode Analytics SQL Tutorial (free)
- Docker: docs.docker.com/get-started

### Deliverable
- [ ] Python fluent with async, Pydantic, pytest
- [ ] Can explain embeddings, tokens, context windows
- [ ] Understand why AI testing is fundamentally different from deterministic testing
- [ ] SQL queries for data validation (JOINs, aggregations, quality checks)
- [ ] Docker: can run a multi-container setup (docker-compose) for AI testing
- [ ] Dev environment configured (Python 3.11+, venv, VS Code, Docker Desktop)

---

## Phase 1: LLM Fundamentals + Testing LLM Outputs (Weeks 3-5)

### Goal
Master direct LLM API usage AND learn how to validate LLM behavior systematically.

### Learn

**Prompt Engineering**:
- Zero-shot: plain instruction with no examples
- Few-shot: providing examples in the prompt
- Chain-of-Thought (CoT): "think step by step" for reasoning
- System prompts: setting persona and constraints
- Structured output: forcing JSON responses via schemas

**API mechanics**:
- Claude API (Anthropic SDK): messages, system prompts, streaming
- OpenAI API: chat completions, function calling
- Gemini API: (deepen your existing knowledge)
- Token counting and cost estimation
- Tool/function calling: letting the model invoke your code

**Testing LLM outputs** (this is where your QA brain activates):
- Why `assert output == expected` doesn't work for LLMs
- Semantic similarity assertions (embedding-based comparison)
- LLM-as-judge: using one model to grade another's output
- Rubric-based evaluation: scoring outputs on multiple dimensions
- Behavioral testing: testing model behavior across categories (like Checklist paper)
- Boundary testing: finding where the model breaks (adversarial inputs)

**AI-Driven Test Generation** (using LLMs to CREATE tests — your QA superpower amplified):
- Use LLMs to auto-generate test cases from:
  - Code/function signatures → unit test generation
  - API specs (OpenAPI/Swagger) → API test case generation
  - User stories/requirements → acceptance test generation
  - Existing test suites → edge case expansion
- Prompt patterns for test generation:
  - "Given this function, generate 10 edge cases that could break it"
  - "Given this API endpoint, generate test scenarios covering happy path, error cases, and boundary values"
  - "Given this user flow, generate adversarial inputs that test robustness"
- Evaluating generated tests: Are they valid? Do they catch real bugs? Are they redundant?
- Building a feedback loop: run generated tests → find failures → regenerate better tests
- Tools: Claude/GPT for generation, pytest for execution, coverage tools for measuring improvement

**Why this matters**: Every AI QA job posting mentions "AI-assisted testing" or "autonomous test generation." This skill means you can generate 100 meaningful test cases in the time it takes to manually write 5.

### Build: Portfolio Project #1 — LLM Testing Framework

**What**: A pytest-based framework for systematically testing LLM applications. Not a chatbot — a *testing tool*.

**Features**:
- Custom pytest fixtures for LLM calls (handles API keys, rate limits)
- Assertion helpers: `assert_semantically_similar(output, expected, threshold=0.85)`
- LLM-as-judge evaluator: `assert_passes_judge(output, criteria="factually accurate")`
- Structured output validation: `assert_matches_schema(output, MyPydanticModel)`
- Test report generation: pass rate, failure analysis, cost tracking
- Parametrized test suites for prompt variations

**Example test**:
```python
@pytest.mark.parametrize("question,expected_topic", [
    ("What is NVDA's market cap?", "nvidia financial data"),
    ("Who trades tech stocks in Congress?", "congressional trading"),
])
def test_response_relevance(llm_client, question, expected_topic):
    response = llm_client.generate(question)
    assert_semantically_similar(response, expected_topic, threshold=0.7)
    assert_no_hallucination(response, sources=retrieved_docs)
    assert_token_count(response, max_tokens=500)
```

**Tech**: Python + pytest + Anthropic/OpenAI SDK + sentence-transformers

**Why this matters**: This is YOUR differentiator. Most AI engineers don't have a testing framework. You're building one from day one.

### Build Steps

1. [ ] **Project setup** — Create repo, set up Python project with `pyproject.toml`, install pytest + sentence-transformers + Anthropic/OpenAI SDKs
2. [ ] **LLM client wrapper** — Build a thin client class that calls Claude/OpenAI APIs with retry logic, rate limiting, and cost tracking
3. [ ] **Semantic similarity assertion** — Implement `assert_semantically_similar()` using sentence-transformers embeddings + cosine similarity
4. [ ] **LLM-as-judge evaluator** — Implement `assert_passes_judge()` that sends output + criteria to an LLM and parses pass/fail verdict
5. [ ] **Schema validation assertion** — Implement `assert_matches_schema()` using Pydantic model validation
6. [ ] **Hallucination detection assertion** — Implement `assert_no_hallucination()` that cross-references output claims against source documents
7. [ ] **Pytest fixtures** — Build reusable fixtures for LLM client initialization, API key management, and response caching (avoid re-calling LLMs in repeated test runs)
8. [ ] **Parametrized test suite** — Create sample test suite with `@pytest.mark.parametrize` testing multiple prompt variations
9. [ ] **Test report generation** — Add custom pytest plugin that generates HTML report with pass rates, costs, and failure analysis
10. [ ] **Meta-testing** — Write tests for your own assertion functions (test that semantic similarity catches bad outputs, measure false positive/negative rates)
11. [ ] **Documentation + README** — Usage examples, installation instructions, architecture diagram

### Test
- Write tests for your own framework (meta-testing)
- Validate: does the semantic similarity assertion catch bad outputs?
- Measure: false positive rate and false negative rate of your assertions

### Enhance ai-infra-watch
- Add a `tests/` folder with LLM output validation tests
- Test: does the Gemini synthesis return valid JSON schemas?
- Test: are stock ticker mentions in the output actually real tickers?
- Test: does the synthesis stay factual relative to input data?

### Milestone Checkpoint
- [ ] Can call 2+ LLM APIs directly (no framework)
- [ ] Built custom assertion functions for LLM outputs
- [ ] Understand LLM-as-judge evaluation pattern
- [ ] AI-driven test generation: can auto-generate test cases from specs/code using LLMs
- [ ] Portfolio Project #1: LLM Testing Framework on GitHub
- [ ] ai-infra-watch has automated LLM output tests

---

## Phase 2: RAG Fundamentals + RAG Evaluation (Weeks 6-9)

### Goal
Build a RAG pipeline AND know exactly how to measure whether it's working.

### Learn

**RAG pipeline** (the builder side):
- Document loading: PDF (PyPDF, pdfplumber), web pages, APIs
- Chunking strategies: fixed-size, recursive character, semantic
- Embedding models: OpenAI, Cohere, sentence-transformers
- Vector stores: ChromaDB (local dev), Pinecone (production)
- Retrieval: similarity search, MMR, hybrid (BM25 + vector)
- Re-ranking: Cohere Rerank, cross-encoders
- Generation: prompt with retrieved context → LLM → answer

**RAG evaluation** (the QA side — this is critical):

The RAGAS framework measures RAG quality across dimensions:

| Metric | What It Measures | How |
|--------|-----------------|-----|
| **Faithfulness** | Is the answer grounded in retrieved docs? | Check each claim against context |
| **Answer Relevance** | Does the answer address the question? | Generate questions from answer, compare to original |
| **Context Precision** | Are retrieved docs actually useful? | Check how many retrieved chunks are relevant |
| **Context Recall** | Did we retrieve all necessary info? | Compare retrieved context against ground truth |

**Component-level testing** (test each RAG stage independently):
- Retriever accuracy: given a question, does it find the right chunks?
- Chunking quality: are chunks coherent? Do they split important info?
- Embedding quality: do similar documents land near each other?
- Generation quality: given perfect context, does the LLM answer correctly?

**End-to-end testing**:
- Golden dataset: question + ground truth answer + source documents
- A/B testing: compare two RAG configurations on the same dataset
- Regression testing: did my latest change improve or degrade quality?

### Build: Portfolio Project #2 — RAG System with Built-In Evaluation

**What**: A financial document Q&A system that includes its own evaluation pipeline. Not just a RAG app — a *self-aware* RAG app that reports its own quality metrics.

**Features**:
- PDF ingestion for SEC filings and earnings calls
- Hybrid retrieval (BM25 + vector)
- Cited answers (shows source chunks)
- Built-in eval dashboard: faithfulness, relevance, precision, recall scores
- A/B comparison: test different chunking/retrieval configs side by side
- Automated regression suite: runs nightly, alerts on quality drops

**Architecture**:
```
[Ingest] → [Chunk] → [Embed] → [Store]

[Query] → [Retrieve] → [Rerank] → [Generate] → [Answer]
                                                      ↓
                                              [Evaluate (RAGAS)]
                                                      ↓
                                              [Quality Dashboard]
```

**Tech**: Python + ChromaDB + sentence-transformers + Claude + RAGAS + FastAPI

**Why this matters**: Every company with a RAG system needs someone who can both improve it AND prove it's getting better. That's you.

### Build Steps

1. [ ] **Project setup** — Create repo, install ChromaDB, sentence-transformers, Claude SDK, RAGAS, FastAPI
2. [ ] **Document ingestion** — Build PDF loader (PyPDF/pdfplumber) for SEC filings, implement recursive character chunking with configurable size/overlap
3. [ ] **Embedding pipeline** — Choose embedding model (e.g., `all-MiniLM-L6-v2`), build embed-and-store pipeline into ChromaDB
4. [ ] **Basic retrieval** — Implement similarity search, test it manually with sample queries
5. [ ] **Hybrid retrieval** — Add BM25 sparse search, implement score fusion (RRF) with vector search
6. [ ] **Re-ranking** — Add cross-encoder or Cohere Rerank on top of hybrid retrieval results
7. [ ] **Generation with citations** — Prompt LLM with retrieved chunks, format answer with source references (chunk IDs, page numbers)
8. [ ] **Golden eval dataset** — Hand-curate 50 question-answer pairs from your financial docs with ground truth answers and source locations
9. [ ] **RAGAS integration** — Wire up RAGAS metrics (faithfulness, relevance, precision, recall), run against golden dataset, establish baseline scores
10. [ ] **A/B comparison tooling** — Build CLI/script to compare two RAG configs (e.g., chunk size 500 vs 1000) on the same eval dataset
11. [ ] **Eval dashboard** — FastAPI endpoint that runs evaluation and returns quality metrics as JSON; simple frontend showing scores over time
12. [ ] **Automated regression** — Script/CI job that runs eval suite nightly, alerts if any metric drops below threshold

### Test
- Create a golden eval dataset: 50 question-answer pairs over your financial docs
- Run RAGAS metrics, establish baselines
- Test retriever in isolation: does it find the right chunks?
- Test generator in isolation: given perfect context, does it answer correctly?
- Test end-to-end: measure faithfulness and relevance

### Enhance ai-infra-watch
- Add RAG layer: ingest SEC filings for tracked companies
- Build eval suite for the RAG: measure retrieval precision and answer faithfulness
- Add a `/api/eval` endpoint that runs your evaluation and returns quality metrics
- CI pipeline: run evals on every change, fail if quality drops below threshold

### Milestone Checkpoint
- [ ] RAG pipeline working with hybrid search
- [ ] Understand RAGAS metrics and can explain each
- [ ] Golden eval dataset created (50+ pairs)
- [ ] Automated regression testing for RAG quality
- [ ] Portfolio Project #2 complete with eval dashboard
- [ ] ai-infra-watch has RAG + automated quality measurement

---

## Phase 3: LangChain + Testing LangChain Applications (Weeks 10-12)

### Goal
Learn the standard framework AND how to test complex chains systematically.

### Learn

**LangChain** (builder side):
- LCEL (LangChain Expression Language): pipe operator, runnables
- Chat models: ChatAnthropic, ChatOpenAI, ChatGoogleGenerativeAI
- Prompts: ChatPromptTemplate, MessagesPlaceholder
- Output parsers: StrOutputParser, JsonOutputParser, PydanticOutputParser
- Retrievers: VectorStoreRetriever, MultiQueryRetriever
- Memory: ConversationBufferMemory, ConversationSummaryMemory
- Callbacks: for tracing and monitoring

**Testing LangChain apps** (QA side):
- Unit testing individual chain components (mock the LLM, test the logic around it)
- Integration testing full chains (real LLM calls, real retrieval)
- Testing with LangSmith datasets (built-in eval framework)
- Snapshot testing for prompts (detect unintended prompt changes)
- Load testing chains (how many concurrent users before degradation?)

**LangSmith for evaluation**:
- Creating datasets (input/output pairs)
- Running evaluations programmatically
- Custom evaluators (your LLM-as-judge + domain-specific checks)
- Comparing runs (which chain version performs better?)
- Monitoring production chains (catch drift)

**Model Drift Detection** (critical AI QA skill — "it worked last week, why is it broken now?"):

What causes drift in AI systems:
- Provider model updates (OpenAI/Anthropic silently update models)
- Data distribution changes (new types of user queries your system hasn't seen)
- RAG index staleness (documents become outdated)
- Prompt-context interaction changes (longer conversations degrade quality)
- Embedding model changes (retrieval quality shifts)

How to detect drift:
- **Statistical monitoring**: Track key metrics over time (faithfulness score, response length, latency)
- **Baseline comparison**: Run eval dataset weekly, compare against known-good baseline
- **Distribution shift detection**: Embed user queries, detect when new queries are far from training distribution
- **Alert thresholds**: Define acceptable ranges, fire alerts when metrics breach them
- **Canary queries**: Inject known-answer queries periodically, verify they still produce correct responses

What to do when drift is detected:
- Triage: is it the model, the data, or the prompt?
- Rollback: revert to last-known-good prompt/config
- Re-evaluate: run full eval suite, identify which categories degraded
- Fix: update prompts, refresh RAG index, or adjust parameters

**Conversational AI / Chatbot Testing** (most AI products ARE chatbots):
- Multi-turn consistency: does the bot contradict itself across turns?
- Context retention: does it remember what was said 5 turns ago?
- Persona adherence: does it stay in character throughout?
- Graceful handling: what happens with off-topic, abusive, or nonsensical input?
- Language quality: grammar, tone, verbosity appropriate to context?
- Turn-taking: does it know when to ask vs answer?
- Conversation termination: does it know when the user is done?
- Testing strategy: parametrized multi-turn test scripts with assertions at each turn

```python
# Example: multi-turn chatbot test
def test_chatbot_context_retention(chatbot):
    r1 = chatbot.send("My name is Harish")
    r2 = chatbot.send("What's my name?")
    assert_semantically_similar(r2, "Harish", threshold=0.8)
    
    r3 = chatbot.send("I work at Perficient")
    r4 = chatbot.send("Where do I work?")
    assert_semantically_similar(r4, "Perficient", threshold=0.8)
```

### Build: Portfolio Project #3 — Conversational RAG with Continuous Evaluation

**What**: A multi-turn chat app over documents that continuously monitors its own quality.

**Features**:
- Multi-turn conversations with memory
- Document upload and processing
- Source citations in every response
- LangSmith integration: every conversation is traced
- Continuous eval: samples conversations, runs quality checks, alerts on drift
- A/B prompt testing: serve two prompt variants, measure which performs better

**Key innovation**: The app doesn't just answer questions — it monitors whether its answers are getting worse over time and alerts you.

**Tech**: Python + LangChain + LangSmith + ChromaDB + FastAPI + React

### Build Steps

1. [ ] **Project setup** — Create repo, install LangChain, LangSmith, ChromaDB, FastAPI; configure LangSmith API keys and project
2. [ ] **Document processing pipeline** — Build upload endpoint (FastAPI) that accepts PDFs, chunks them, and stores in ChromaDB
3. [ ] **Conversational chain** — Build LCEL chain with `ConversationBufferMemory` + retriever + ChatPromptTemplate with `MessagesPlaceholder` for history
4. [ ] **Citation extraction** — Modify generation prompt to return structured citations (source doc, page, chunk); parse into response format
5. [ ] **LangSmith tracing** — Enable tracing for all chain invocations; verify traces appear in LangSmith dashboard
6. [ ] **Multi-turn testing** — Write parametrized test scripts: multi-turn conversations where later turns reference earlier context
7. [ ] **Continuous eval sampler** — Background job that samples N% of production conversations, runs RAGAS/LLM-as-judge on them, stores scores
8. [ ] **Drift detection** — Track eval scores over time; implement threshold-based alerting (email/Slack) when scores drop below baseline
9. [ ] **A/B prompt testing** — Router that randomly assigns users to prompt variant A or B; log which variant each conversation used
10. [ ] **Eval comparison dashboard** — Show per-variant scores (faithfulness, relevance) so you can pick the winner
11. [ ] **React frontend** — Chat UI with message history, source citations panel, and admin view showing eval metrics
12. [ ] **Load testing** — Use locust or similar to simulate 50 concurrent users; measure latency and quality degradation under load

### Test
- Unit test each chain component independently
- Integration test the full conversational flow
- Eval dataset: multi-turn conversations with ground truth
- Load test: 50 concurrent users — does quality degrade?
- Regression test: change a prompt, measure impact before deploying

### Enhance ai-infra-watch
- Refactor Gemini calls to LangChain chains
- Add LangSmith tracing to all chains
- Build continuous evaluation: sample 10% of user queries, auto-evaluate quality
- Alert system: Slack/email when quality drops below threshold

### Milestone Checkpoint
- [ ] LCEL chains fluent
- [ ] LangSmith integrated for tracing and evaluation
- [ ] Continuous monitoring detecting quality drift
- [ ] Portfolio Project #3 complete with self-monitoring
- [ ] ai-infra-watch has LangSmith tracing + continuous eval

---

## Phase 4: LangGraph, Agents + Testing Agents (Weeks 13-16)

### Goal
Build multi-step agents AND develop testing strategies for non-deterministic, multi-step systems.

### Learn

**LangGraph** (builder side):
- State: TypedDict or Pydantic model flowing through the graph
- Nodes: functions that transform state
- Edges: unconditional connections
- Conditional edges: routing based on state (decision-making)
- Checkpointing: save/resume agent state
- Human-in-the-loop: pause for approval
- Subgraphs: compose smaller graphs into larger systems

**Agent patterns**:
- ReAct: Reason → Act → Observe → Repeat
- Plan-and-Execute: create plan, execute steps
- Multi-agent: supervisor delegates to specialists
- Reflection: agent critiques and improves own output

**Testing agents** (this is HARD and where you shine):

The challenge: Agents are non-deterministic, multi-step, and path-dependent. Traditional testing breaks down completely.

**Strategy 1: Trajectory Testing**
- Don't just test final output — test the path the agent took
- "Did it use the right tool?" "Did it search before answering?"
- Assert on intermediate states, not just final state

**Strategy 2: Behavioral Testing**
- Define behavioral categories: "always searches before answering financial questions"
- Test across many inputs: does the behavior hold consistently?
- Catch: agent works for 90% of inputs but fails on specific patterns

**Strategy 3: Tool Call Validation**
- Test that tools are called with correct arguments
- Test that tool results are used correctly in subsequent reasoning
- Mock tools to inject specific scenarios (tool failure, empty results)

**Strategy 4: State Machine Validation**
- Test that the graph visits expected nodes for a given input type
- Test conditional edges: "if X, it should route to Y"
- Test termination: does the agent actually stop? (infinite loop detection)

**Strategy 5: Adversarial Testing**
- Prompt injection: can a user make the agent do something unintended?
- Tool misuse: can the agent be tricked into calling dangerous tools?
- Confusion testing: ambiguous inputs that could route multiple ways

**Strategy 6: Self-Healing Test Automation** (AI-powered test resilience):

The problem: Traditional test automation is brittle. A UI change breaks selectors. An API response structure changes. Tests fail for reasons unrelated to actual bugs.

Self-healing means: tests that detect WHY they failed and FIX THEMSELVES.

**How it works with AI**:
```
[Test fails] → [AI analyzes failure]
    ↓
Is it a real bug? → [Report bug, keep test as-is]
    ↓
Is it a locator/selector change? → [AI finds new locator, updates test]
    ↓
Is it a response format change? → [AI updates assertion to match new format]
    ↓
Is it a timing issue? → [AI adds appropriate wait]
```

**Implementation approaches**:
- **Selector healing**: When a Playwright selector fails, use LLM + page DOM to find the equivalent new selector
- **Assertion adaptation**: When response schema changes, detect if the data is semantically the same but structurally different
- **Visual healing**: Screenshot comparison → LLM decides if change is intentional (UI update) or a bug
- **Self-documenting failures**: AI generates human-readable explanation of why the test broke

**Your advantage**: You already know Playwright deeply. Adding AI-powered healing on top of your existing automation skills = direct evolution of your current expertise.

```python
# Example: self-healing locator
async def resilient_click(page, original_selector, intent="click the submit button"):
    try:
        await page.click(original_selector)
    except:
        # Selector broke — ask LLM to find the right element
        dom = await page.content()
        new_selector = await llm_find_selector(dom, intent)
        await page.click(new_selector)
        # Update test file with new selector for next run
        update_selector_in_test(original_selector, new_selector)
```

**Tools in this space**: Healenium, Testim, Mabl (commercial) — but building your own with LLMs is more powerful and demonstrates understanding.

### Build: Portfolio Project #4 — Agent Testing Harness

**What**: A testing framework specifically designed for LangGraph agents. The counterpart to your Project #1, but for complex multi-step systems.

**Features**:
- Trajectory assertions: `assert_tool_called(trajectory, "search_tool", before="answer")`
- State validation: `assert_state_at_node(graph, "synthesize", contains={"sources": [...]})`
- Behavioral test suites: parametrized tests across behavioral categories
- Replay testing: record an agent run, replay to check for regressions
- Coverage metrics: which nodes/edges were exercised?
- Adversarial test generators: auto-generate edge cases

**Also includes a working agent to test against**:
- Multi-tool research agent (web search, doc reader, calculator)
- Conditional routing (simple questions → direct answer, complex → research loop)
- Human-in-the-loop for sensitive operations

**Tech**: Python + LangGraph + pytest + custom assertion library

**Why this matters**: Nobody has good tooling for testing agents yet. If you build this well and open-source it, it becomes a career-defining project.

### Build Steps

1. [ ] **Project setup** — Create repo, install LangGraph, pytest; define project structure (`harness/`, `agents/`, `tests/`)
2. [ ] **Build the test subject agent** — Create a multi-tool research agent (LangGraph) with web search, doc reader, calculator tools and conditional routing (simple → direct, complex → research loop)
3. [ ] **Trajectory recorder** — Middleware/callback that logs every node visited, tool called, and state transition during an agent run
4. [ ] **Trajectory assertions** — Implement `assert_tool_called(trajectory, tool, before=node)`, `assert_visited_node()`, `assert_not_visited()`
5. [ ] **State validation helpers** — Implement `assert_state_at_node(graph, node_name, contains={...})` to check intermediate state
6. [ ] **Behavioral test framework** — Define behavioral categories (e.g., "always searches before answering financial questions"), build parametrized tests across 10+ inputs per category
7. [ ] **Replay testing** — Serialize a successful run (checkpointed states); build replay mechanism that re-runs and diffs against the recording
8. [ ] **Coverage metrics** — Instrument graph to track which nodes/edges were exercised across all test runs; report uncovered paths
9. [ ] **Adversarial test generator** — Use LLM to auto-generate edge-case inputs (ambiguous queries, prompt injections, tool-misuse attempts)
10. [ ] **Human-in-the-loop testing** — Test the approval/rejection paths; verify agent pauses correctly and handles both approve/deny
11. [ ] **Infinite loop detection** — Add max-iteration guard + test that intentionally triggers loops to verify detection works
12. [ ] **Pytest plugin + CLI** — Package as installable pytest plugin with CLI: `agent-test run --graph my_graph.py --suite behavioral`
13. [ ] **Documentation** — README with architecture, usage examples, and how to add custom assertions

### Test
- Test the agent: trajectory testing, behavioral testing, adversarial testing
- Test the harness itself: does it catch known failure modes?
- Benchmark: compare agent quality across different graph architectures

### Enhance ai-infra-watch
- Build LangGraph pipeline for data synthesis (replace monolithic Gemini call)
- Add trajectory logging: record every node the agent visits
- Build regression suite: test agent behavior across 30+ scenario types
- Adversarial tests: can a user query make the agent hallucinate financial advice?

### Milestone Checkpoint
- [ ] LangGraph state machines with conditional routing
- [ ] ReAct agent working with multiple tools
- [ ] Trajectory testing implemented
- [ ] Behavioral and adversarial test suites built
- [ ] Portfolio Project #4: Agent Testing Harness on GitHub
- [ ] ai-infra-watch agent pipeline with automated behavioral tests

---

## Phase 5: MCP + Multi-Agent Orchestration (Weeks 17-20)

### Goal
Master the Model Context Protocol (the standard for connecting AI to external tools/data) AND multi-agent orchestration patterns (multiple agents collaborating on complex tasks).

### Learn

**MCP (Model Context Protocol)** — Anthropic's open standard, now adopted across the industry:

**What is MCP?**
- A protocol that standardizes how AI models connect to external tools, data sources, and services
- Think of it as "USB-C for AI" — one standard interface, many integrations
- Replaces custom tool implementations with a universal protocol
- Client-server architecture: your AI app (client) connects to MCP servers (tools/data)

**MCP Architecture**:
```
[AI Application (MCP Client)]
        ↓ MCP Protocol
[MCP Server: Database] [MCP Server: GitHub] [MCP Server: Slack] [MCP Server: Custom API]
```

**Core MCP Concepts**:
- **Resources**: Data the server exposes (files, DB records, API responses)
- **Tools**: Actions the server can perform (create_issue, send_message, query_db)
- **Prompts**: Pre-built prompt templates the server provides
- **Sampling**: Server requesting the client's LLM to generate (reverse direction)
- **Transport**: stdio (local) vs SSE/HTTP (remote)

**Building MCP Servers**:
- Python SDK (`mcp` package): define tools, resources, prompts
- TypeScript SDK: for Node.js-based servers
- Server lifecycle: initialize → handle requests → respond
- Authentication and authorization patterns
- Error handling and graceful degradation

**Building MCP Clients**:
- Connecting to multiple MCP servers simultaneously
- Tool discovery: dynamically listing available tools from servers
- Tool routing: which server handles which request
- Session management: maintaining state across tool calls

**Using existing MCP servers**:
- Database MCP servers (PostgreSQL, SQLite, MongoDB)
- GitHub MCP server (issues, PRs, code search)
- Slack/Discord MCP servers
- File system MCP server
- Web search MCP servers (Brave, Tavily)
- **Playwright MCP server (`@playwright/mcp`)** — THIS IS YOUR SUPERPOWER (see below)
- Custom MCP servers for your domain

**Playwright MCP — where your existing skills meet the AI future**:

The official Playwright MCP server lets AI agents control browsers through MCP. This directly connects your Playwright expertise to agent systems:

- **What it does**: Exposes browser automation (navigate, click, fill, screenshot, scrape) as MCP tools
- **Install**: `npm install @playwright/mcp` or use via `npx @anthropic-ai/claude-code --mcp`
- **Tools exposed**: `navigate`, `click`, `fill`, `screenshot`, `evaluate`, `get_text`, `wait_for_selector`, etc.

**Why this matters for you specifically**:
1. You already understand Playwright selectors, page interactions, and browser automation
2. Now your AI agents can use that knowledge — an agent can browse the web, fill forms, test UIs
3. **Autonomous QA agents**: Build an agent that uses Playwright MCP to explore and test web apps without pre-written scripts — exactly what the xponentiate job posting asked for
4. **Web scraping for RAG**: Agent uses Playwright MCP to scrape dynamic JS-heavy pages that simple HTTP fetches can't handle
5. **End-to-end AI testing**: Agent drives the browser to test your own AI-powered features

**Project idea (HIGH PRIORITY — combines everything)**:
Build an autonomous QA agent that:
- Receives a URL and test objective ("verify the checkout flow works")
- Uses Playwright MCP to explore the page (no pre-written selectors)
- Uses an LLM to decide what to click/fill next based on page state
- Discovers bugs by reasoning about expected vs actual behavior
- Reports findings with screenshots and reproduction steps

This is the exact product that companies like xponentiate are building. If you have this on GitHub, you're interview-ready for those roles.

**Why MCP matters for jobs**: Job postings increasingly mention "MCP integration" and "tool orchestration." Companies want engineers who can both build MCP servers AND integrate them into agent systems.

---

**Multi-Agent Orchestration** — multiple AI agents working together:

**Why multi-agent?** Single agents hit limits:
- Context window overflow on complex tasks
- One agent can't be expert at everything
- Sequential processing is slow for parallelizable work
- No checks and balances (single point of failure)

**Orchestration Patterns** (from simple to complex):

**Pattern 1: Sequential Pipeline**
```
[Agent A: Research] → [Agent B: Analyze] → [Agent C: Write Report]
```
- Each agent has a focused role
- Output of one feeds into the next
- Simple, predictable, easy to test

**Pattern 2: Supervisor / Router**
```
[Supervisor Agent]
   ├→ [Worker: Search]
   ├→ [Worker: Code]
   ├→ [Worker: Analyze]
   └→ [Worker: Summarize]
```
- Supervisor decides which worker handles each subtask
- Workers report back to supervisor
- Supervisor synthesizes final output
- LangGraph implementation: supervisor node with conditional edges to workers

**Pattern 3: Hierarchical (Supervisors of Supervisors)**
```
[Executive Agent]
   ├→ [Research Supervisor]
   │      ├→ [Web Searcher]
   │      └→ [Doc Reader]
   └→ [Analysis Supervisor]
          ├→ [Quant Analyst]
          └→ [Risk Analyst]
```
- For complex tasks requiring multiple specializations
- Each level adds coordination overhead — use only when needed

**Pattern 4: Peer-to-Peer / Collaboration**
```
[Agent A] ←→ [Agent B] ←→ [Agent C]
```
- Agents communicate directly without a supervisor
- Useful for debate, brainstorming, adversarial verification
- Harder to control and test

**Pattern 5: Agent Handoff (Swarm pattern)**
```
[Triage Agent] → handoff → [Specialist Agent] → handoff → [Closer Agent]
```
- Agents transfer context and control to the next appropriate agent
- Each agent has clear entry/exit criteria
- OpenAI Swarm pattern, also in LangGraph

**Orchestration Frameworks**:

| Framework | Approach | When to Use |
|-----------|----------|-------------|
| **LangGraph** | Graph-based state machines | Full control, complex routing, production-grade |
| **CrewAI** | Role-based agents with tasks | Rapid prototyping, role-playing patterns |
| **AutoGen** | Conversational agents | Research, multi-turn agent discussions |
| **OpenAI Swarm** | Lightweight handoffs | Simple agent transfer patterns |

**LangGraph Multi-Agent** (deep dive — this is the production choice):
- `create_react_agent()` for individual agents
- Supervisor graph that routes between agents
- Shared state vs isolated state (what agents can see of each other's work)
- Message passing between agents
- Parallel agent execution (fan-out, fan-in)
- Checkpointing at agent boundaries (resume if one agent fails)

**MCP + Multi-Agent Integration**:
- Each agent can have its own MCP tools (specialist tools)
- Shared MCP servers across agents (common data layer)
- MCP as the tool layer, LangGraph as the orchestration layer
- Pattern: Agent discovers available tools via MCP → decides which to use → executes

---

**Testing Multi-Agent Systems** (QA side — extremely challenging):

**Challenge**: Multi-agent systems are non-deterministic x N agents. The interaction space explodes.

**Strategy 1: Agent Isolation Testing**
- Test each agent independently with mocked inputs/outputs from other agents
- Verify: does each agent fulfill its role correctly in isolation?
- Then test integration: do they compose correctly?

**Strategy 2: Communication Protocol Testing**
- Verify messages between agents are well-formed
- Test: does Agent B correctly interpret Agent A's output?
- Edge case: what happens if Agent A returns unexpected format?

**Strategy 3: Orchestration Logic Testing**
- Test the supervisor's routing decisions independently
- Given this state, does it pick the right worker?
- Test all routing paths are reachable

**Strategy 4: Emergent Behavior Testing**
- Multi-agent systems produce emergent behaviors (not designed into any single agent)
- Test for undesirable emergent patterns: infinite loops, deadlocks, circular delegation
- Test for quality: does the multi-agent system outperform a single agent?

**Strategy 5: MCP Server Testing**
- Unit test each MCP server's tools independently
- Integration test: agent → MCP server → external system → response
- Contract testing: verify MCP server schema matches client expectations
- Chaos testing: what happens when an MCP server goes down mid-agent-execution?

**Strategy 6: End-to-End Orchestration Testing**
- Golden path tests: known-good inputs through the full multi-agent pipeline
- Timeout testing: set max execution time, verify graceful degradation
- Cost testing: does the multi-agent system stay within token budget?
- Replay testing: record a successful run, replay to detect regressions

---

### Build: Portfolio Project #5 — MCP-Powered Multi-Agent System

**What**: A multi-agent research and analysis platform connected to real-world data via MCP servers.

**Architecture**:
```
[User Query]
      ↓
[Supervisor Agent (LangGraph)]
      ├→ [Research Agent] → MCP: Web Search, MCP: Arxiv, MCP: News API
      ├→ [Data Agent] → MCP: PostgreSQL, MCP: Financial API
      ├→ [Analysis Agent] → MCP: Python Executor, MCP: Visualization
      └→ [Report Agent] → MCP: File System, MCP: Template Engine
      ↓
[Synthesized Report with Citations]
```

**Features**:
- 4 specialist agents, each with their own MCP tool connections
- Supervisor with intelligent routing (decides which agents to invoke)
- Parallel execution: Research + Data agents run simultaneously
- 3 custom MCP servers you build:
  - Financial data MCP server (wraps your ai-infra-watch data)
  - Document store MCP server (wraps your RAG vector store)
  - Notification MCP server (sends alerts via email/Slack)
- Agent handoff: Research agent can delegate to Data agent mid-task
- Full test suite: isolation tests, integration tests, orchestration tests

**Tech**: Python + LangGraph + MCP SDK + FastAPI + custom MCP servers

**Why this matters for portfolio**: "Built MCP servers and integrated them into a multi-agent orchestration system" is exactly what job postings mean by "Agentic AI Engineer." Plus you have tests for it — nobody else does.

### Build Steps

1. [ ] **Project setup** — Create repo, install MCP Python SDK, LangGraph, FastAPI; define monorepo structure (`servers/`, `agents/`, `orchestrator/`, `tests/`)
2. [ ] **MCP Server #1: Financial Data** — Build MCP server exposing stock data (from ai-infra-watch sources) as resources + query tools; implement stdio transport
3. [ ] **MCP Server #2: Document Store** — Build MCP server wrapping your ChromaDB vector store as search/retrieve tools
4. [ ] **MCP Server #3: Notifications** — Build MCP server with tools for sending alerts (email/Slack webhook)
5. [ ] **MCP client** — Build client that connects to all 3 servers simultaneously, discovers tools dynamically, and manages sessions
6. [ ] **Research Agent** — LangGraph agent that uses Web Search + Arxiv MCP tools for information gathering
7. [ ] **Data Agent** — LangGraph agent that uses Financial Data MCP server for market queries
8. [ ] **Analysis Agent** — LangGraph agent that processes research + data, produces structured analysis
9. [ ] **Report Agent** — LangGraph agent that takes analysis output and formats a final report with citations
10. [ ] **Supervisor graph** — LangGraph supervisor with conditional routing to the 4 agents; implement parallel fan-out for Research + Data agents
11. [ ] **Agent handoff** — Implement context transfer protocol between agents (Research → Data delegation mid-task)
12. [ ] **Test suite: isolation** — Unit test each MCP server's tools independently; unit test each agent with mocked MCP responses
13. [ ] **Test suite: integration** — Agent + real MCP server tests; contract tests (schema matching)
14. [ ] **Test suite: orchestration** — Full pipeline trajectory tests + chaos test (kill MCP server mid-execution, verify graceful recovery)
15. [ ] **Autonomous QA Agent (Bonus)** — Build LangGraph agent using Playwright MCP to explore a given URL, reason about page state, discover bugs, and report with screenshots

### Test
- Unit test each MCP server independently (tool calls, error handling)
- Unit test each agent in isolation (mocked MCP responses)
- Integration test: agent + real MCP server
- Orchestration test: full pipeline with trajectory assertions
- Chaos test: kill an MCP server mid-execution, verify graceful recovery
- Performance test: measure latency added by MCP protocol overhead
- Contract test: MCP server schema matches what agents expect

### Enhance ai-infra-watch
- Build MCP servers for ai-infra-watch's data sources:
  - `mcp-server-stocks`: exposes real-time stock data as MCP resources + tools
  - `mcp-server-congress`: exposes congressional trade data
  - `mcp-server-contracts`: exposes contract ledger
  - `mcp-server-risks`: exposes geopolitical risk registry
- Multi-agent pipeline for synthesis:
  - Market Agent (uses mcp-server-stocks)
  - Policy Agent (uses mcp-server-congress)
  - Risk Agent (uses mcp-server-risks)
  - Supervisor synthesizes all findings
- Test the full multi-agent pipeline with automated behavioral + trajectory tests

### Bonus Build: Autonomous QA Agent (Playwright MCP) — Your Differentiator

**What**: An AI agent that autonomously tests web applications using Playwright MCP. No pre-written test scripts — the agent explores, reasons, and reports bugs.

**How it works**:
```
[User gives URL + test objective]
       ↓
[Agent screenshots page] → [LLM analyzes page structure]
       ↓
[Agent decides action] → [Playwright MCP executes: click/fill/navigate]
       ↓
[Agent observes result] → [LLM evaluates: expected vs actual]
       ↓ unexpected behavior
[Bug Report: screenshot + steps + reasoning]
       ↓ normal behavior
[Continue exploring → loop until objective covered]
```

**Tech**: Python + LangGraph + Playwright MCP + Claude/OpenAI (vision for screenshots)

**Why this is your #1 portfolio piece**: It combines your Playwright expertise, agent skills, MCP knowledge, and QA mindset into one project. This IS the xponentiate job description as a GitHub repo.

### Milestone Checkpoint
- [ ] Built 3+ custom MCP servers with tools and resources
- [ ] MCP client connecting to multiple servers simultaneously
- [ ] Playwright MCP integrated — agent can browse and interact with web pages
- [ ] Autonomous QA agent exploring and testing a web app via Playwright MCP
- [ ] Supervisor pattern orchestrating 3+ specialist agents
- [ ] Agent handoff working (context transfer between agents)
- [ ] Parallel agent execution (fan-out/fan-in)
- [ ] Multi-agent testing: isolation, integration, orchestration, chaos
- [ ] Portfolio Project #5: MCP Multi-Agent System on GitHub
- [ ] ai-infra-watch has MCP servers + multi-agent synthesis pipeline

---

## Phase 6: Advanced Patterns + Advanced Evaluation (Weeks 21-24)

### Goal
Master sophisticated AI patterns AND the evaluation techniques that prove they work.

### Learn

**Advanced RAG patterns** (builder side):
- Corrective RAG: evaluate retrieval quality, re-query if poor
- Self-RAG: model decides when to retrieve vs answer from memory
- Graph RAG: knowledge graphs + communities for multi-hop questions
- Agentic RAG: agent decides what/where to retrieve, iterates

**Advanced agent patterns**:
- Multi-agent debate: Bull vs Bear vs Judge
- Self-correction loops: generate → evaluate → fix → re-evaluate
- Memory systems: short-term, long-term, episodic
- Prompt decomposition: map-reduce, refine, tree-of-thought

**Optimization**:
- Semantic caching (embedding-based cache lookup)
- Model routing (cheap model for easy queries, expensive for hard ones)
- Parallel retrieval across multiple sources

**Advanced evaluation** (QA side):

**Hallucination detection**:
- Claim decomposition: break answer into individual claims
- Source grounding: check each claim against retrieved documents
- Contradiction detection: does the output contradict its own sources?
- Fabrication detection: facts that appear in no source

**Multi-agent evaluation**:
- Judge panels: 3 LLMs evaluate independently, majority wins
- Perspective-diverse judges: each scores on a different dimension
- Meta-evaluation: evaluating the evaluators (are your judges reliable?)

**Evaluation at scale**:
- Synthetic test data generation (LLM generates test cases from documents)
- Stratified evaluation: ensure coverage across query types, difficulty levels
- Statistical significance: is a 2% improvement real or noise?
- Cost-aware evaluation: how much does running your eval suite cost?

**Red-teaming AI systems**:
- Systematic adversarial input generation
- Jailbreak testing (prompt injection resistance)
- Bias testing (differential behavior across demographic groups)
- Edge case discovery (what inputs cause the worst outputs?)

### Build: Portfolio Project #6 — AI Red-Teaming & Evaluation Platform

**What**: A comprehensive platform for red-teaming and evaluating AI applications. Think "Playwright for AI systems."

**Features**:
- Synthetic test case generation from documents/schemas
- Multi-dimensional evaluation (faithfulness, relevance, safety, bias)
- Red-team module: automated adversarial input generation
- Hallucination detection pipeline (claim extraction → source check)
- Regression dashboard: track quality over time across dimensions
- CI/CD integration: run as part of deployment pipeline, gate on quality
- Report generation: "AI Quality Report" with scores, failures, recommendations

**Tech**: Python + LangGraph + RAGAS + custom evaluators + FastAPI + dashboard UI

**Why this matters**: This is the tool that companies desperately need but nobody has built well yet. "Playwright for AI" is a positioning that resonates with hiring managers.

### Build Steps

1. [ ] **Project setup** — Create repo, install RAGAS, LangGraph, FastAPI; structure as `generators/`, `evaluators/`, `red_team/`, `dashboard/`, `tests/`
2. [ ] **Target system interface** — Build an adapter layer that can wrap any LLM app (accepts query → returns response + sources); start with your own RAG project as the target
3. [ ] **Synthetic test case generator** — Use LLM to generate diverse test questions from source documents/schemas; categorize by difficulty and type
4. [ ] **Multi-dimensional evaluator** — Implement scoring across dimensions: faithfulness (RAGAS), relevance, safety (toxicity check), bias (demographic parity)
5. [ ] **Hallucination detection pipeline** — Step 1: Claim extraction (break response into atomic claims). Step 2: Source grounding (check each claim against retrieved docs). Step 3: Score and flag ungrounded claims
6. [ ] **Red-team module: adversarial input generator** — Build LLM-powered generator that creates prompt injections, jailbreak attempts, edge cases, and bias-triggering inputs
7. [ ] **Red-team execution runner** — Run adversarial inputs against target system, collect responses, evaluate if defenses held
8. [ ] **Regression tracking** — Store all eval results in a time-series DB (SQLite is fine); track scores per dimension over time
9. [ ] **Quality dashboard** — FastAPI + simple frontend showing: current scores, trends, worst-performing categories, red-team success rate
10. [ ] **CI/CD integration** — GitHub Actions workflow that runs eval suite on PR, posts quality report as PR comment, blocks merge if thresholds breached
11. [ ] **Report generator** — Auto-generate "AI Quality Report" (markdown/PDF) with scores, top failures, recommendations, and trend analysis
12. [ ] **Meta-evaluation** — Benchmark your evaluators against human judgments: compute correlation between your automated scores and manual human labels

### Test
- Validate your red-team generates meaningful adversarial inputs (not random noise)
- Measure: does your hallucination detector catch known hallucinations?
- Benchmark: evaluate your evaluator against human judgments (correlation score)

### Enhance ai-infra-watch
- Implement multi-agent debate for risk assessment with judge evaluation
- Add hallucination detection: every synthesis is checked for fabricated claims
- Red-team the system: generate adversarial queries, measure failure rate
- Build quality dashboard: track all metrics over time

### Milestone Checkpoint
- [ ] Corrective RAG implemented and evaluated
- [ ] Multi-agent system with proper evaluation
- [ ] Hallucination detection pipeline working
- [ ] Red-teaming generating meaningful adversarial cases
- [ ] Portfolio Project #6: AI Red-Teaming Platform on GitHub
- [ ] ai-infra-watch has hallucination detection + red-team results

---

## Phase 7: Production AI Systems + Production Monitoring (Weeks 25-28)

### Goal
Ship AI systems that are observable, safe, cost-effective, and continuously monitored.

### Learn

**Observability**:
- LangSmith/Langfuse: trace every LLM call, visualize chains
- Key metrics: latency (p50/p95/p99), token usage, error rates, cost per query
- Distributed tracing for multi-agent systems
- Alert rules: latency spike, error rate increase, cost anomaly

**Guardrails & safety**:
- Input validation: prompt injection detection, off-topic filtering
- Output validation: PII detection, harmful content filtering
- Guardrails AI, NeMo Guardrails libraries
- Content policy enforcement

**Cost optimization**:
- Token budgeting per query
- Caching layers (exact → semantic → no cache)
- Model cascading (try cheap model first, escalate if needed)
- Prompt optimization (shorter = cheaper without losing quality)

**CI/CD for AI**:
- Prompt version control (treat prompts as code)
- Eval-gated deployments (don't deploy if quality drops)
- Canary deployments for prompt changes (serve to 5%, measure, then roll out)
- Rollback strategies when quality degrades

**Streaming & UX**:
- Token-by-token streaming (SSE, WebSocket)
- Intermediate step streaming ("Searching...", "Analyzing...")
- Graceful degradation

**Fine-tuning basics**:
- When to fine-tune vs prompt (format/style = fine-tune, knowledge = RAG)
- LoRA/QLoRA on consumer hardware
- Evaluation: does fine-tuned beat prompting?

### Build: Portfolio Project #7 — Production AI Quality Pipeline

**What**: A complete CI/CD quality pipeline for AI applications. The culmination of everything.

**Features**:
- GitHub Actions integration: runs on every PR
- Multi-stage evaluation: component evals → integration evals → adversarial evals
- Quality gates: PR blocked if faithfulness < 0.85 or hallucination rate > 5%
- Cost tracking: estimated cost impact of prompt changes
- Canary deployment support: gradual rollout with quality monitoring
- Production monitoring dashboard: real-time quality metrics
- Automatic alerting: Slack notification when quality degrades
- Incident playbook: when alert fires, here's the investigation workflow

**Tech**: Python + GitHub Actions + LangSmith + FastAPI + Grafana/dashboard

**Why this matters**: This demonstrates production maturity. You're not just building AI — you're building the infrastructure to keep AI reliable in production. That's senior-level thinking.

### Build Steps

1. [ ] **Project setup** — Create repo, set up GitHub Actions, install LangSmith SDK, FastAPI, Grafana (or lightweight dashboard alternative)
2. [ ] **Eval suite library** — Package your evaluators from Projects #1-6 into a reusable library (semantic similarity, RAGAS, hallucination detection, adversarial checks)
3. [ ] **GitHub Actions: component eval stage** — Workflow that runs unit-level evaluations (individual chain components) on every PR
4. [ ] **GitHub Actions: integration eval stage** — Workflow that runs end-to-end evaluations (full RAG pipeline, full agent trajectory) after component evals pass
5. [ ] **GitHub Actions: adversarial eval stage** — Workflow that runs red-team adversarial inputs against the changed system
6. [ ] **Quality gates** — Configure pass/fail thresholds: block PR if faithfulness < 0.85, hallucination rate > 5%, or adversarial success rate > 10%
7. [ ] **Cost impact estimator** — Parse prompt changes in PR diff, estimate token cost delta (more tokens = higher cost), report as PR comment
8. [ ] **Canary deployment config** — Implement feature flag or traffic splitting: new prompt version serves to 5% of traffic initially
9. [ ] **Production monitoring: LangSmith integration** — Trace all production LLM calls, capture latency (p50/p95/p99), token usage, error rates
10. [ ] **Real-time quality metrics** — Sample production responses, run lightweight eval (faithfulness + relevance), store time-series scores
11. [ ] **Alerting** — Slack/email alerts when: quality drops below threshold, latency spikes, error rate increases, cost anomaly detected
12. [ ] **Monitoring dashboard** — Real-time view: quality scores, latency percentiles, cost per query, error rate, canary vs stable comparison
13. [ ] **Incident playbook** — Document: when an alert fires → what to investigate → how to rollback → how to diagnose (model? data? prompt?)
14. [ ] **Self-test: inject known-bad changes** — Create test PR with intentionally degraded prompts; verify pipeline catches and blocks them

### Test
- Test the pipeline itself: inject known-bad changes, verify they're caught
- Measure: false positive rate (blocking good changes) vs false negative rate (allowing bad changes)
- Load test: can the eval pipeline handle the PR volume of a real team?

### Enhance ai-infra-watch (Final form)
- Full observability: every LLM call traced with LangSmith
- Quality gates in CI: PRs must pass eval suite
- Production monitoring: real-time faithfulness and relevance scores
- Cost dashboard: cost per synthesis, trend over time
- Guardrails: no investment advice, PII protection, cite sources
- Canary deploys for prompt changes
- Anomaly detection + investigation agent
- All MCP servers monitored with health checks and fallback behavior

### Milestone Checkpoint
- [ ] CI/CD pipeline catching quality regressions
- [ ] Production monitoring with alerting
- [ ] Guardrails preventing unsafe outputs
- [ ] Cost optimization measurable (before/after)
- [ ] Portfolio Project #7: Production Quality Pipeline on GitHub
- [ ] ai-infra-watch is a fully monitored, evaluated, guarded system

---

## Portfolio Summary

| # | Project | Demonstrates |
|---|---------|-------------|
| 1 | LLM Testing Framework | Can test non-deterministic AI outputs systematically |
| 2 | RAG System with Built-In Eval | Can build AND measure RAG quality (RAGAS, golden datasets) |
| 3 | Conversational RAG with Continuous Eval | Can monitor live AI systems for quality drift |
| 4 | Agent Testing Harness | Can test complex multi-step agents (trajectory, behavioral, adversarial) |
| 5 | MCP-Powered Multi-Agent System | Can build MCP servers, orchestrate multiple agents, test agent coordination |
| 6 | AI Red-Teaming Platform | Can break AI systems systematically and measure safety |
| 7 | Production AI Quality Pipeline | Can ship AI safely with eval-gated CI/CD |

**Plus**: ai-infra-watch as the living demo of progressive AI enhancement with quality at every step.

### How These Map to Job Requirements

| Job Requirement | Your Evidence |
|-----------------|--------------|
| "Test AI/ML applications" | Projects 1, 2, 4, 6 |
| "Build RAG systems" | Projects 2, 3, ai-infra-watch |
| "LangChain/LangGraph experience" | Projects 3, 4, 5, 6, 7 |
| "Agent development" | Projects 4, 5, ai-infra-watch |
| "MCP integration" | Project 5, ai-infra-watch |
| "Multi-agent orchestration" | Project 5, ai-infra-watch |
| "Agentic AI systems" | Projects 4, 5, 6 |
| "AI-driven test generation" | Project 1 (LLM generates test cases) |
| "Self-healing test automation" | Project 4 (AI-powered locator/assertion healing) |
| "Model drift detection" | Projects 3, 7 (baseline monitoring + alerting) |
| "Chatbot/conversational AI testing" | Project 3 (multi-turn validation) |
| "Evaluation frameworks" | Projects 1, 2, 6, 7 |
| "Production ML monitoring" | Projects 3, 7 |
| "LLM safety and guardrails" | Projects 6, 7 |
| "CI/CD for AI" | Project 7 |
| "Docker/containerization" | All projects (test environments) |
| "SQL & data validation" | Phase 0 foundation + RAG data pipelines |
| "Tool/function calling" | Projects 1, 4, 5 |
| "Automation testing background" | Playwright repo + ALL projects |

---

## Your Competitive Advantage (Interview Story)

> "I transitioned from Automation QA to AI Engineering because I saw that most AI teams ship without proper testing. My QA mindset means I don't just build RAG and agents — I build the evaluation pipelines that prove they work. I've created MCP servers that connect agents to real-world data, built multi-agent orchestration systems with proper supervisor patterns, and — critically — I know how to test them. Trajectory testing, behavioral testing, chaos testing for multi-agent coordination. My portfolio shows both the builder and validator sides — I can ship features AND prevent regressions."

This narrative is unique. Pure AI engineers can't tell it. Pure QA engineers can't tell it. Only the hybrid can.

---

## Daily Schedule Template (3-4 hours)

### Option A: Theory Day (early in a phase)
| Time | Activity |
|------|----------|
| 45 min | Read docs / watch course (builder concept) |
| 45 min | Read docs / watch course (testing/eval concept) |
| 60 min | Hands-on coding exercise |
| 30 min | Notes, reflect, plan tomorrow |

### Option B: Build Day (mid-phase)
| Time | Activity |
|------|----------|
| 15 min | Review yesterday, plan today's task |
| 90 min | Build (the system/feature) |
| 60 min | Test (write evals/tests for what you built) |
| 15 min | Git commit, document learnings |

### Option C: Review Day (once per week)
| Time | Activity |
|------|----------|
| 30 min | Review week's notes |
| 60 min | Refactor/improve earlier project with new knowledge |
| 60 min | Read a paper or blog post |
| 30 min | Write "what I learned" log |

### Weekly split:
- Monday-Tuesday: Theory Days (learn both build + test concepts)
- Wednesday-Friday: Build Days (always build AND write tests)
- Saturday: Review Day
- Sunday: Rest

---

## Resources by Phase

### Phase 0: Foundations
- **[LinkedIn] The AI Ecosystem for Developers: Models, Datasets, and APIs** (3h 31m)
- **[LinkedIn] Generative AI: Introduction to Large Language Models** (1h 36m)
- [Real Python: Async IO](https://realpython.com/async-io-python/)
- [Pydantic V2 Docs](https://docs.pydantic.dev/latest/)
- [pytest Documentation](https://docs.pytest.org/)
- [Jay Alammar: Illustrated Word2Vec](https://jalammar.github.io/illustrated-word2vec/)

### Phase 1: LLM Fundamentals + Testing
- **[LinkedIn/Anthropic] Claude Code in Action** (1h 10m — understand the tool you use daily)
- **[LinkedIn/Anthropic] Building with the Claude API** (8h 11m — THIS IS YOUR PHASE 1 CORE COURSE)
- **[LinkedIn] Complete Guide to Evaluating LLMs** (7h 56m — LLM evaluation deep dive, QA-focused)
- **[LinkedIn] Applied AI: Getting Started with Hugging Face Transformers** (1h 14m)
- **[LinkedIn] Hands-On AI: Building Your First LLM-Powered App** (1h 14m)
- [Anthropic Prompt Engineering Guide](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering)
- [OpenAI Cookbook](https://cookbook.openai.com/)
- [DeepLearning.AI: ChatGPT Prompt Engineering](https://www.deeplearning.ai/short-courses/)
- [Behavioral Testing of NLP Models (Checklist paper)](https://arxiv.org/abs/2005.04118)

### Phase 2: RAG + Evaluation
- **[LinkedIn] Local AI: Build a RAG Model from Scratch with Open-Source Tools** (2h 21m)
- **[LinkedIn] Hands-On AI: Introduction to RAG** (39m)
- [RAGAS Documentation](https://docs.ragas.io/)
- [DeepLearning.AI: Building and Evaluating Advanced RAG](https://www.deeplearning.ai/short-courses/)
- [ChromaDB Docs](https://docs.trychroma.com/)
- [LangChain RAG Tutorial](https://python.langchain.com/docs/tutorials/rag/)

### Phase 3: LangChain + LangSmith
- [LangChain Python Docs](https://python.langchain.com/docs/introduction/)
- [LangSmith Documentation](https://docs.smith.langchain.com/)
- [LangSmith Evaluation Guide](https://docs.smith.langchain.com/evaluation)
- [DeepLearning.AI: LangChain courses](https://www.deeplearning.ai/short-courses/)

### Phase 4: LangGraph + Agent Testing
- **[LinkedIn] Build AI Agents and Chatbots with LangGraph** (1h 14m — 64,500 learners, proven course)
- **[LinkedIn] Build with AI: Autonomous Agents with LangChain and Hugging Face** (1h 20m)
- **[LinkedIn] Build with AI: Reasoning Models for AI Agents** (15m — quick conceptual overview)
- **[LinkedIn] Agentic AI and Autonomous Development** (59m)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangGraph Academy](https://academy.langchain.com/)
- [Anthropic: Building Effective Agents](https://docs.anthropic.com/en/docs/build-with-claude/agent-patterns)
- [DeepLearning.AI: AI Agents in LangGraph](https://www.deeplearning.ai/short-courses/)

### Phase 5: MCP + Multi-Agent Orchestration
- **[LinkedIn/Anthropic] Introduction to Model Context Protocol** (1h 1m — from MCP creators)
- **[LinkedIn/Anthropic] Model Context Protocol: Advanced Topics** (~1h — servers, advanced patterns)
- **[LinkedIn] Build with AI: Agentic Applications with LlamaIndex and MCP** (~1h — LlamaIndex + MCP)
- **[LinkedIn] Building AI-Powered Browser Agents with Playwright and LLMs** (47m — YOUR KEY COURSE)
- **[LinkedIn] Operating AI Agents: Failure and Recovery** (~42m — production resilience)
- [MCP Specification (Official)](https://modelcontextprotocol.io/)
- [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Anthropic: MCP Introduction](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [Playwright MCP Server](https://github.com/microsoft/playwright-mcp)
- [Playwright MCP Docs](https://playwright.dev/docs/mcp)
- [LangGraph Multi-Agent Tutorial](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/)
- [CrewAI Documentation](https://docs.crewai.com/)
- [AutoGen Documentation](https://microsoft.github.io/autogen/)
- [OpenAI Swarm (agent handoff patterns)](https://github.com/openai/swarm)
- [DeepLearning.AI: Multi AI Agent Systems with CrewAI](https://www.deeplearning.ai/short-courses/)

### Phase 6: Advanced Patterns + Red-Teaming
- [Self-RAG paper](https://arxiv.org/abs/2310.11511)
- [Corrective RAG paper](https://arxiv.org/abs/2401.15884)
- [Microsoft Graph RAG](https://arxiv.org/abs/2404.16130)
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [Garak (LLM vulnerability scanner)](https://github.com/leondz/garak)

### Phase 7: Production
- [Langfuse Docs](https://langfuse.com/docs)
- [Guardrails AI](https://www.guardrailsai.com/docs)
- [Chip Huyen: Designing Machine Learning Systems](https://www.oreilly.com/library/view/designing-machine-learning/9781098107956/)
- [Eugene Yan: LLM Patterns](https://eugeneyan.com/writing/llm-patterns/)

### General (throughout)
- [Chip Huyen's Blog](https://huyenchip.com/blog/)
- [Hamel Husain's Blog](https://hamel.dev/)
- [LangChain Blog](https://blog.langchain.dev/)
- [Anthropic Research](https://www.anthropic.com/research)

---

## Progress Tracker

### Phase 0: Foundations (Weeks 1-2)
- [ ] Python async/await, Pydantic, pytest fluent
- [ ] SQL data validation queries (JOINs, aggregations, quality checks)
- [ ] Docker basics (can run docker-compose for multi-service AI test environments)
- [ ] Understand non-deterministic testing challenge
- [ ] Dev environment ready

### Phase 1: LLM + Testing LLM Outputs (Weeks 3-5)
- [ ] Direct API calls to 2+ providers
- [ ] Tool calling from scratch
- [ ] Semantic similarity assertions working
- [ ] LLM-as-judge evaluation implemented
- [ ] AI-driven test generation (auto-generate test cases from specs)
- [ ] Portfolio Project #1: LLM Testing Framework

### Phase 2: RAG + RAG Evaluation (Weeks 6-9)
- [ ] RAG pipeline with hybrid search
- [ ] RAGAS metrics understood and implemented
- [ ] Golden eval dataset (50+ pairs)
- [ ] A/B comparison between RAG configs
- [ ] Portfolio Project #2: RAG with Built-In Eval

### Phase 3: LangChain + Continuous Eval (Weeks 10-12)
- [ ] LCEL chains fluent
- [ ] LangSmith tracing + evaluation
- [ ] Model drift detection implemented (baseline + alerts)
- [ ] Conversational AI testing (multi-turn consistency, persona, context retention)
- [ ] Continuous quality monitoring
- [ ] Portfolio Project #3: Conversational RAG with Monitoring

### Phase 4: LangGraph/Agents + Agent Testing (Weeks 13-16)
- [ ] LangGraph conditional routing
- [ ] ReAct agent with tools
- [ ] Trajectory testing implemented
- [ ] Self-healing test automation (AI-powered selector/assertion healing)
- [ ] Adversarial testing for agents
- [ ] Portfolio Project #4: Agent Testing Harness

### Phase 5: MCP + Multi-Agent Orchestration (Weeks 17-20)
- [ ] Built 3+ custom MCP servers
- [ ] MCP client connecting to multiple servers
- [ ] Supervisor pattern orchestrating specialist agents
- [ ] Agent handoff working
- [ ] Parallel agent execution (fan-out/fan-in)
- [ ] Multi-agent testing (isolation, integration, chaos)
- [ ] Portfolio Project #5: MCP Multi-Agent System

### Phase 6: Advanced Patterns + Red-Teaming (Weeks 21-24)
- [ ] Corrective RAG working
- [ ] Multi-agent debate with evaluation
- [ ] Hallucination detection pipeline
- [ ] Red-teaming automation
- [ ] Portfolio Project #6: AI Red-Teaming Platform

### Phase 7: Production + CI/CD Quality (Weeks 25-28)
- [ ] Full observability pipeline
- [ ] Eval-gated CI/CD
- [ ] Production monitoring with alerting
- [ ] Guardrails preventing unsafe outputs
- [ ] Portfolio Project #7: Production Quality Pipeline
- [ ] ai-infra-watch: complete production-grade system

---

## Final Notes

**Your secret weapon is your QA background.** Don't downplay it — lean into it. The AI industry has a testing crisis. Companies are shipping hallucinating models with no evaluation pipelines. You're the person who fixes that.

**Build AND test in every session.** Never write code without writing its test. This habit makes you better than 90% of AI engineers who "test manually by asking the chatbot a few questions."

**The portfolio tells a story.** It's not 7 random projects — it's a progression from "I can test LLM outputs" to "I can build MCP-connected multi-agent systems and ship them with production-grade monitoring." Each project references and builds on the previous.

**Don't abandon Playwright.** Your Playwright skills transfer to AI testing automation. Playwright tests a web UI; your new tools test an AI system. Same systematic mindset, different target.

**MCP is the new API.** Just like REST APIs became the standard for web services, MCP is becoming the standard for AI-tool integration. Learning it now puts you ahead — most engineers still build custom tool integrations that will become obsolete.
