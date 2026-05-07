from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime


@dataclass(slots=True)
class ChunkRecord:
    chunk_id: str
    note_id: str
    title: str
    note_date: date
    content: str
    chunk_index: int
    embedding: list[float] | None = None
    embedding_provider: str | None = None
    embedding_model: str | None = None


@dataclass(slots=True)
class SearchCandidate(ChunkRecord):
    semantic_score: float = 0.0
    keyword_score: float = 0.0
    rerank_score: float = 0.0
    provider_rerank_score: float | None = None
    reason: str = ""


@dataclass(slots=True)
class NoteRecord:
    id: str
    title: str
    content: str
    note_date: date
    source_name: str | None
    source_path: str | None
    chunk_count: int
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True, slots=True)
class QueryDiagnostics:
    query_mode: str
    retrieval_latency_ms: float
    rerank_latency_ms: float
    generation_latency_ms: float
    total_latency_ms: float
    semantic_mode: str
    reranker_mode: str
    answer_provider: str
    citation_count: int
    insufficient_evidence: bool
