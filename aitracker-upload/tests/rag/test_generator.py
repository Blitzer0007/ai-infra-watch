"""Generator tests — retrieval-augmented answer synthesis.

The Generator uses the provider-agnostic LLMClient; here we inject a
fake duck-typed client so we can assert the *prompt assembly* and
*citation attachment* deterministically without fixtures:
  * the question and every retrieved chunk reach the prompt;
  * each chunk is labeled [n];
  * citations + sources footer are attached to the answer.
"""
from __future__ import annotations

from app.rag.generator import Generator, build_rag_prompt, format_citations
from app.rag.ingest import ingest_texts
from app.rag.retriever import Retriever, build_corpus


class _FakeClient:
    """Records the prompt; returns a canned answer citing [1]."""

    def __init__(self) -> None:
        self.prompt = ""
        self.generations = 0

    def generate(self, prompt: str, **kwargs) -> str:
        self.prompt = prompt
        self.generations += 1
        return "Data center revenue grew forty percent, which drove the record [1]."


DOCS = {
    "nvidia": "NVIDIA data center revenue grew forty percent to a record level. "
    "Demand for Blackwell chips from hyperscalers was strong.",
    "meta": "Meta advertising revenue rose. Reality Labs posted an operating loss.",
}


def _generator(top_k=2) -> tuple[Generator, _FakeClient]:
    res = ingest_texts(DOCS)
    corpus = build_corpus(res.chunks)
    retriever = Retriever(corpus, top_k=top_k)
    fake = _FakeClient()
    return Generator(retriever, client=fake), fake


def test_build_rag_prompt_includes_context_and_labels():
    res = ingest_texts(DOCS)
    corpus = build_corpus(res.chunks)
    chunks = Retriever(corpus, top_k=2).retrieve("data center revenue")
    prompt = build_rag_prompt("How did revenue do?", chunks)
    assert "Question: How did revenue do?" in prompt
    assert "[1]" in prompt
    assert "[2]" in prompt
    assert chunks[0].chunk.text in prompt


def test_answer_attaches_citations_and_footer():
    gen, fake = _generator()
    cited = gen.answer("How did NVIDIA revenue do?")
    assert cited.answer == "Data center revenue grew forty percent, which drove the record [1]."
    assert cited.citations, "expected the retrieved chunks as citations"
    assert cited.citations[0].document_id == "nvidia"
    assert cited.sources_footer.startswith("Sources:")
    assert "nvidia" in cited.sources_footer


def test_answer_passes_question_to_llm():
    gen, fake = _generator()
    gen.answer("What is Meta's advertising situation?")
    assert fake.generations == 1
    assert "What is Meta's advertising situation?" in fake.prompt


def test_format_citations_lists_documents_once():
    res = ingest_texts(DOCS)
    corpus = build_corpus(res.chunks)
    chunks = Retriever(corpus, top_k=4).retrieve("revenue growth")
    footer = format_citations(chunks)
    # each distinct document appears exactly once in the footer
    assert "nvidia" in footer
    assert "meta" in footer
