"""Ingestion — documents on disk -> embedded chunks.

Supported inputs:
  * `.txt` / `.md` — read as UTF-8.
  * `.pdf`        — text extracted with pypdf (page text joined).

Each source file becomes one logical document (its stem is the
`document_id`); the text is chunked and every chunk is embedded with
the shared `get_embedder()` so the vector arm and the assertion layer
use one model. Embedding is attached to the `Chunk` (frozen dataclass
-> rebuilt via `replace`).

PDF extraction is best-effort: scanned/image-only PDFs yield little
text and are surfaced via `IngestResult.empty_documents` rather than
silently dropped.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from pathlib import Path

from app.assertions.semantic import get_embedder
from app.rag.chunker import Chunker
from app.rag.schemas import Chunk


@dataclass
class IngestResult:
    chunks: list[Chunk] = field(default_factory=list)
    documents: list[str] = field(default_factory=list)
    empty_documents: list[str] = field(default_factory=list)
    embed_mode: str = "lexical"

    def __len__(self) -> int:
        return len(self.chunks)


def load_text(path: Path) -> str:
    """Extract text from a single file (.txt/.md/.pdf)."""
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix == ".pdf":
        return _load_pdf(path)
    raise ValueError(f"Unsupported document type: {path.suffix} ({path.name})")


def _load_pdf(path: Path) -> str:
    from pypdf import PdfReader

    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # pragma: no cover - malformed page
            pages.append("")
    return "\n\n".join(pages).strip()


def ingest_texts(
    docs: dict[str, str],
    chunker: Chunker | None = None,
    context_prefix: dict[str, str] | None = None,
) -> IngestResult:
    """Chunk + embed an in-memory {document_id: text} mapping.

    This is the hermetic core the tests drive directly (no disk / no
    PDFs), so retrieval quality can be asserted deterministically.

    `context_prefix` optionally prepends a label to each document's
    chunks for embedding/BM25 (e.g. {"nvda_10k": "NVIDIA Corporation
    10-K annual report"}). This keeps the entity identity with every
    chunk — critical for filings where the company name appears only in
    the header — without polluting the stored chunk text that gets
    cited in answers.
    """
    chunker = chunker or Chunker()
    embedder = get_embedder()
    result = IngestResult(embed_mode=embedder.mode())
    for doc_id, text in docs.items():
        text = (text or "").strip()
        if not text:
            result.empty_documents.append(doc_id)
            continue
        raw_chunks = chunker.chunk(text, doc_id)
        if not raw_chunks:
            result.empty_documents.append(doc_id)
            continue
        prefix = (context_prefix or {}).get(doc_id, "")
        for c in raw_chunks:
            # Contextualized text is what BOTH arms index and embed; the
            # clean `text` is what answers cite.
            embed_text = f"{prefix}\n{c.text}" if prefix else c.text
            vec = tuple(embedder.embed(embed_text))
            result.chunks.append(
                replace(c, embedding=vec, index_text=embed_text if prefix else None)
            )
        result.documents.append(doc_id)
    return result


def ingest_paths(
    paths: list[Path],
    chunker: Chunker | None = None,
    context_prefix: dict[str, str] | None = None,
) -> IngestResult:
    """Load, chunk, and embed a list of files on disk."""
    docs: dict[str, str] = {}
    empty: list[str] = []
    for p in paths:
        doc_id = p.stem
        text = load_text(p)
        if text.strip():
            docs[doc_id] = text
        else:
            empty.append(doc_id)
    result = ingest_texts(docs, chunker=chunker, context_prefix=context_prefix)
    result.empty_documents.extend(empty)
    return result


def ingest_directory(
    directory: Path,
    chunker: Chunker | None = None,
    context_prefix: dict[str, str] | None = None,
) -> IngestResult:
    """Ingest every supported file in a directory (non-recursive)."""
    if not directory.exists():
        return IngestResult()
    paths = sorted(
        p for p in directory.iterdir()
        if p.is_file() and p.suffix.lower() in (".txt", ".md", ".pdf")
    )
    return ingest_paths(paths, chunker=chunker, context_prefix=context_prefix)


def title_prefixes(docs: dict[str, str]) -> dict[str, str]:
    """Derive a context prefix per document from its first line.

    For filings the first line is the registrant title, e.g.
    "NVIDIA CORPORATION — FORM 10-K (Fiscal Year 2025 Excerpt)".
    The company name is the most valuable identity token for retrieval,
    so we keep the leading entity words of the title line.
    """
    prefixes: dict[str, str] = {}
    for doc_id, text in docs.items():
        first = (text or "").strip().splitlines()[0] if (text or "").strip() else ""
        # Keep up to ~6 leading words (company + corporate designator).
        words = [w for w in first.split() if w]
        prefix = " ".join(words[:6]).strip(" -–")
        prefixes[doc_id] = prefix
    return prefixes
