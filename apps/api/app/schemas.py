from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class NoteCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=30, max_length=40_000)
    note_date: date
    source_name: str | None = Field(default=None, max_length=160)

    @field_validator("title", "content", "source_name", mode="before")
    @classmethod
    def trim_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class NoteSummary(BaseModel):
    id: str
    title: str
    note_date: date
    source_name: str | None = None
    source_path: str | None = None
    chunk_count: int
    created_at: datetime
    updated_at: datetime


class NoteDetail(NoteSummary):
    content: str


class NoteUpdate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=30, max_length=40_000)
    note_date: date
    source_name: str | None = Field(default=None, max_length=160)

    @field_validator("title", "content", "source_name", mode="before")
    @classmethod
    def trim_strings(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


class QueryRequest(BaseModel):
    question: str = Field(min_length=5, max_length=500)
    top_k: int = Field(default=5, ge=3, le=8)

    @field_validator("question")
    @classmethod
    def clean_question(cls, value: str) -> str:
        return " ".join(value.strip().split())


class Citation(BaseModel):
    chunk_id: str
    note_id: str
    title: str
    note_date: date
    excerpt: str
    reason: str
    score: float


class RecurringTheme(BaseModel):
    theme: str
    note_count: int
    evidence_count: int
    summary: str
    representative_notes: list[str]


class TimelineEvent(BaseModel):
    note_id: str
    title: str
    note_date: date
    summary: str
    score: float


class NoteLink(BaseModel):
    source_note_id: str
    source_title: str
    source_date: date
    target_note_id: str
    target_title: str
    target_date: date
    shared_themes: list[str]
    rationale: str
    strength: float


class ThemeDrift(BaseModel):
    theme: str
    recent_count: int
    previous_count: int
    delta: int
    direction: str
    summary: str


class MemoryTrailStep(BaseModel):
    note_id: str
    title: str
    note_date: date
    summary: str


class MemoryTrail(BaseModel):
    topic: str
    arc_summary: str
    steps: list[MemoryTrailStep]


class MemoryGraphNode(BaseModel):
    note_id: str
    title: str
    note_date: date
    primary_theme: str | None = None
    degree: int = 0


class MemoryOverviewResponse(BaseModel):
    total_notes: int
    themes: list[RecurringTheme] = Field(default_factory=list)
    theme_drift: list[ThemeDrift] = Field(default_factory=list)
    timeline: list[TimelineEvent] = Field(default_factory=list)
    suggested_links: list[NoteLink] = Field(default_factory=list)
    memory_trails: list[MemoryTrail] = Field(default_factory=list)
    graph_nodes: list[MemoryGraphNode] = Field(default_factory=list)
    graph_links: list[NoteLink] = Field(default_factory=list)


class QueryDiagnosticsResponse(BaseModel):
    retrieval_latency_ms: float
    rerank_latency_ms: float
    generation_latency_ms: float
    total_latency_ms: float
    semantic_mode: str
    reranker_mode: str
    answer_provider: str
    citation_count: int
    insufficient_evidence: bool


class QueryResponse(BaseModel):
    answer: str
    why_selected: str
    suggested_actions: list[str]
    citations: list[Citation]
    recurring_themes: list[RecurringTheme] = Field(default_factory=list)
    timeline: list[TimelineEvent] = Field(default_factory=list)
    note_links: list[NoteLink] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    confidence_label: str
    insufficient_evidence: bool = False
    diagnostics: QueryDiagnosticsResponse | None = None


class FeedbackCreate(BaseModel):
    question: str = Field(min_length=5, max_length=500)
    answer: str = Field(min_length=5, max_length=4000)
    useful: bool


class DemoLoadResponse(BaseModel):
    loaded_notes: int
    total_notes: int


class SyncFolderRequest(BaseModel):
    folder_path: str = Field(min_length=1, max_length=600)

    @field_validator("folder_path")
    @classmethod
    def clean_path(cls, value: str) -> str:
        return value.strip()


class SyncFolderResponse(BaseModel):
    imported_notes: int
    updated_notes: int
    total_notes: int


class MemoryLinkDecisionRequest(BaseModel):
    source_note_id: str = Field(min_length=1, max_length=120)
    target_note_id: str = Field(min_length=1, max_length=120)
    decision: str = Field(pattern="^(accepted|rejected)$")
