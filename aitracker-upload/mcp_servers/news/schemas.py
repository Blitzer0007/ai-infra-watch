from __future__ import annotations

from pydantic import BaseModel, Field


class NewsArticle(BaseModel):
    id: str | None = None
    published_at: str
    headline: str
    source: str
    summary: str = ""
    url: str = ""
    related: list[str] = Field(default_factory=list)
    category: str | None = None


class NewsBatch(BaseModel):
    query: str
    source: str
    articles: list[NewsArticle] = Field(default_factory=list)


class NewsHealth(BaseModel):
    source: str
    ok: bool
    message: str = ""
