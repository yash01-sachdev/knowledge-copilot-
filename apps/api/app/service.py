from __future__ import annotations

import re
from datetime import date as calendar_date
from pathlib import Path
from time import perf_counter

from .composer import compose_answer
from .config import Settings
from .domain import ChunkRecord, QueryDiagnostics, SearchCandidate
from .memory_graph import build_memory_overview
from .providers import (
    AnswerProvider,
    EmbeddingProvider,
    LocalAnswerProvider,
    RerankItem,
    RerankRequest,
    RerankerProvider,
    build_answer_provider,
    build_embedding_provider,
    build_reranker_provider,
)
from .repository import SQLiteRepository
from .sample_data import SAMPLE_NOTES
from .schemas import (
    DemoLoadResponse,
    FeedbackCreate,
    MemoryLinkDecisionRequest,
    MemoryOverviewResponse,
    NoteCreate,
    NoteDetail,
    NoteSummary,
    NoteUpdate,
    QueryRequest,
    QueryDiagnosticsResponse,
    QueryResponse,
    SyncFolderRequest,
    SyncFolderResponse,
)
from .search import HybridSearchEngine, merge_candidates, rerank_candidates
from .text_utils import chunk_text, normalize_whitespace


DATE_PATTERN = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")


class KnowledgeService:
    def __init__(
        self,
        repository: SQLiteRepository,
        settings: Settings | None = None,
        *,
        embedding_provider: EmbeddingProvider | None = None,
        answer_provider: AnswerProvider | None = None,
        reranker_provider: RerankerProvider | None = None,
    ) -> None:
        self.repository = repository
        self.settings = settings or Settings.from_env()
        self.search_engine = HybridSearchEngine()
        self.memory_overview = MemoryOverviewResponse(total_notes=0)
        self.embedding_provider = embedding_provider if embedding_provider is not None else build_embedding_provider(self.settings)
        self.fast_answer_provider = LocalAnswerProvider()
        self.quality_answer_provider = answer_provider if answer_provider is not None else build_answer_provider(self.settings)
        self.reranker_provider = reranker_provider if reranker_provider is not None else build_reranker_provider(self.settings)
        self.refresh_state()

    def refresh_state(self) -> None:
        chunks = self.repository.fetch_all_chunks()
        hydrated_chunks = self._ensure_chunk_embeddings(chunks)
        self.search_engine.rebuild(hydrated_chunks)
        notes = self.repository.fetch_all_notes()
        link_feedback = self.repository.list_note_link_feedback()
        graph_result = build_memory_overview(notes, link_feedback)
        self.repository.replace_note_links(graph_result.link_rows)
        self.memory_overview = graph_result.overview

    def create_note(self, payload: NoteCreate) -> NoteSummary:
        result = self.repository.add_note(
            title=payload.title,
            content=normalize_whitespace(payload.content),
            note_date=payload.note_date,
            source_name=payload.source_name,
            source_path=None,
            chunks=chunk_text(normalize_whitespace(payload.content)),
        )
        self.refresh_state()
        return NoteSummary.model_validate(result)

    def update_note(self, note_id: str, payload: NoteUpdate) -> NoteDetail | None:
        normalized_content = normalize_whitespace(payload.content)
        result = self.repository.update_note(
            note_id,
            title=payload.title,
            content=normalized_content,
            note_date=payload.note_date,
            source_name=payload.source_name,
            chunks=chunk_text(normalized_content),
        )
        if result is None:
            return None
        self.refresh_state()
        return self.get_note(note_id)

    def list_notes(self) -> list[NoteSummary]:
        return [NoteSummary.model_validate(row) for row in self.repository.list_notes()]

    def get_note(self, note_id: str) -> NoteDetail | None:
        note = self.repository.get_note(note_id)
        if note is None:
            return None
        return NoteDetail.model_validate(note)

    def delete_note(self, note_id: str) -> NoteDetail | None:
        note = self.get_note(note_id)
        if note is None:
            return None
        deleted = self.repository.delete_note(note_id)
        if not deleted:
            return None
        self.refresh_state()
        return note

    def answer_question(self, payload: QueryRequest) -> QueryResponse:
        response, _ = self.answer_question_with_diagnostics(payload)
        return response

    def answer_question_with_diagnostics(self, payload: QueryRequest) -> tuple[QueryResponse, QueryDiagnostics]:
        quality_mode = payload.mode == "quality"
        semantic_limit = max(payload.top_k * (3 if quality_mode else 2), self.settings.semantic_limit + (4 if quality_mode else 0))
        keyword_limit = max(payload.top_k * (3 if quality_mode else 2), self.settings.keyword_limit + (4 if quality_mode else 0))
        answer_provider = self.quality_answer_provider if quality_mode else self.fast_answer_provider

        total_start = perf_counter()
        retrieval_start = perf_counter()
        semantic_hits, semantic_mode = self.search_engine.semantic_search_with_mode(
            payload.question,
            limit=semantic_limit,
            embedding_provider=self.embedding_provider,
        )
        keyword_hits = self.repository.keyword_search(payload.question, limit=keyword_limit)
        candidates = merge_candidates(semantic_hits, keyword_hits)
        reranked = rerank_candidates(payload.question, candidates, mode=payload.mode)
        rerank_latency_ms = 0.0
        reranker_mode = f"local-smart:{payload.mode}"
        if self.reranker_provider is not None and quality_mode and reranked:
            rerank_start = perf_counter()
            reranked, reranker_mode = self._apply_provider_reranker(payload.question, reranked)
            rerank_latency_ms = (perf_counter() - rerank_start) * 1000
        top_candidates = reranked[: payload.top_k]
        retrieval_latency_ms = (perf_counter() - retrieval_start) * 1000

        generation_start = perf_counter()
        response = compose_answer(
            payload.question,
            top_candidates,
            answer_provider=answer_provider,
        )
        generation_latency_ms = (perf_counter() - generation_start) * 1000
        total_latency_ms = (perf_counter() - total_start) * 1000

        diagnostics = QueryDiagnostics(
            query_mode=payload.mode,
            retrieval_latency_ms=round(retrieval_latency_ms, 3),
            rerank_latency_ms=round(rerank_latency_ms, 3),
            generation_latency_ms=round(generation_latency_ms, 3),
            total_latency_ms=round(total_latency_ms, 3),
            semantic_mode=semantic_mode,
            reranker_mode=reranker_mode,
            answer_provider=f"{answer_provider.provider_name}:{answer_provider.model_name}",
            citation_count=len(response.citations),
            insufficient_evidence=response.insufficient_evidence,
        )
        response = response.model_copy(
            update={
                "diagnostics": QueryDiagnosticsResponse(
                    query_mode=diagnostics.query_mode,
                    retrieval_latency_ms=diagnostics.retrieval_latency_ms,
                    rerank_latency_ms=diagnostics.rerank_latency_ms,
                    generation_latency_ms=diagnostics.generation_latency_ms,
                    total_latency_ms=diagnostics.total_latency_ms,
                    semantic_mode=diagnostics.semantic_mode,
                    reranker_mode=diagnostics.reranker_mode,
                    answer_provider=diagnostics.answer_provider,
                    citation_count=diagnostics.citation_count,
                    insufficient_evidence=diagnostics.insufficient_evidence,
                )
            }
        )
        return response, diagnostics

    def get_memory_overview(self) -> MemoryOverviewResponse:
        return self.memory_overview

    def record_link_decision(self, payload: MemoryLinkDecisionRequest) -> MemoryOverviewResponse:
        self.repository.set_note_link_feedback(
            payload.source_note_id,
            payload.target_note_id,
            payload.decision,
        )
        self.refresh_state()
        return self.memory_overview

    def record_feedback(self, payload: FeedbackCreate) -> None:
        self.repository.add_feedback(
            question=payload.question,
            answer=payload.answer,
            useful=payload.useful,
        )

    def load_demo_notes(self) -> DemoLoadResponse:
        loaded = 0
        existing_titles = {note.title for note in self.list_notes()}
        for sample in SAMPLE_NOTES:
            if sample["title"] in existing_titles:
                continue
            normalized_content = normalize_whitespace(sample["content"])
            self.repository.add_note(
                title=sample["title"],
                content=normalized_content,
                note_date=NoteCreate.model_validate(sample).note_date,
                source_name=sample["source_name"],
                source_path=None,
                chunks=chunk_text(normalized_content),
            )
            loaded += 1
        self.refresh_state()
        return DemoLoadResponse(loaded_notes=loaded, total_notes=self.repository.note_count())

    def sync_folder(self, payload: SyncFolderRequest) -> SyncFolderResponse:
        folder = Path(payload.folder_path).expanduser()
        if not folder.exists() or not folder.is_dir():
            raise ValueError("Choose an existing folder path before syncing.")

        imported_notes = 0
        updated_notes = 0
        files = sorted(
            [
                *folder.rglob("*.md"),
                *folder.rglob("*.markdown"),
                *folder.rglob("*.txt"),
            ]
        )
        for file_path in files:
            if not file_path.is_file():
                continue
            content = file_path.read_text(encoding="utf-8", errors="ignore")
            draft = self._infer_imported_note(file_path=file_path, content=content)
            existing = self.repository.find_note_by_source_path(str(file_path.resolve()))
            normalized_content = normalize_whitespace(draft["content"])
            chunks = chunk_text(normalized_content)

            if existing is None:
                self.repository.add_note(
                    title=draft["title"],
                    content=normalized_content,
                    note_date=draft["note_date"],
                    source_name=draft["source_name"],
                    source_path=draft["source_path"],
                    chunks=chunks,
                )
                imported_notes += 1
                continue

            self.repository.update_note(
                str(existing["id"]),
                title=draft["title"],
                content=normalized_content,
                note_date=draft["note_date"],
                source_name=draft["source_name"],
                source_path=draft["source_path"],
                chunks=chunks,
            )
            updated_notes += 1

        self.refresh_state()
        return SyncFolderResponse(
            imported_notes=imported_notes,
            updated_notes=updated_notes,
            total_notes=self.repository.note_count(),
        )

    def _infer_imported_note(self, *, file_path: Path, content: str) -> dict[str, object]:
        normalized_content = normalize_whitespace(content)
        heading_match = re.search(r"^#\s+(.+)$", normalized_content, re.MULTILINE)
        title = heading_match.group(1).strip() if heading_match else self._title_from_file(file_path.name)
        date_match = DATE_PATTERN.search(file_path.name) or DATE_PATTERN.search(normalized_content)
        note_date = date_match.group(1) if date_match else None

        return {
            "title": title,
            "content": normalized_content,
            "note_date": NoteCreate.model_validate(
                {
                    "title": title,
                    "content": normalized_content if len(normalized_content) >= 30 else f"{normalized_content}\nImported note content.",
                    "note_date": note_date or self._today_string(),
                    "source_name": file_path.name,
                }
            ).note_date,
            "source_name": file_path.name,
            "source_path": str(file_path.resolve()),
        }

    def _title_from_file(self, file_name: str) -> str:
        title = re.sub(r"\.[^.]+$", "", file_name)
        title = re.sub(r"[-_]+", " ", title)
        title = re.sub(r"\s+", " ", title).strip()
        return title.title() or "Imported Note"

    def _today_string(self) -> str:
        return calendar_date.today().isoformat()

    def _ensure_chunk_embeddings(self, chunks: list[ChunkRecord]) -> list[ChunkRecord]:
        if self.embedding_provider is None:
            return chunks

        missing_chunks = [
            chunk
            for chunk in chunks
            if chunk.embedding is None
            or chunk.embedding_provider != self.embedding_provider.provider_name
            or chunk.embedding_model != self.embedding_provider.model_name
        ]
        if not missing_chunks:
            return chunks

        updated_rows: list[tuple[str, list[float], str, str]] = []
        for batch_start in range(0, len(missing_chunks), self.settings.embedding_batch_size):
            batch = missing_chunks[batch_start : batch_start + self.settings.embedding_batch_size]
            try:
                embeddings = self.embedding_provider.embed_texts(
                    [self._embedding_text_for_chunk(chunk) for chunk in batch]
                )
            except Exception:
                return chunks

            if len(embeddings) != len(batch):
                return chunks

            for chunk, embedding in zip(batch, embeddings, strict=True):
                chunk.embedding = embedding
                chunk.embedding_provider = self.embedding_provider.provider_name
                chunk.embedding_model = self.embedding_provider.model_name
                updated_rows.append(
                    (
                        chunk.chunk_id,
                        embedding,
                        self.embedding_provider.provider_name,
                        self.embedding_provider.model_name,
                    )
                )

        self.repository.update_chunk_embeddings(updated_rows)
        return chunks

    def _embedding_text_for_chunk(self, chunk: ChunkRecord) -> str:
        return f"{chunk.title}\n\n{chunk.content}"

    def _apply_provider_reranker(
        self,
        question: str,
        candidates: list[SearchCandidate],
    ) -> tuple[list[SearchCandidate], str]:
        if self.reranker_provider is None:
            return candidates, "local-smart"

        selected = candidates[: self.settings.reranker_limit]
        try:
            reranked = self.reranker_provider.rerank(
                RerankRequest(
                    question=question,
                    items=[
                        RerankItem(
                            chunk_id=candidate.chunk_id,
                            title=candidate.title,
                            note_date=candidate.note_date.isoformat(),
                            content=candidate.content[:900],
                            current_score=candidate.rerank_score,
                        )
                        for candidate in selected
                    ],
                )
            )
        except Exception:
            return candidates, "local-smart"

        scores = {item.chunk_id: item.score for item in reranked}
        for candidate in selected:
            provider_score = scores.get(candidate.chunk_id)
            if provider_score is None:
                continue
            candidate.provider_rerank_score = provider_score
            candidate.rerank_score = max(0.0, min(1.0, (0.45 * candidate.rerank_score) + (0.55 * provider_score)))
            if provider_score >= 0.75 and "provider rerank" not in candidate.reason:
                candidate.reason = f"{candidate.reason}, provider rerank".strip(", ")
        updated = sorted(candidates, key=lambda item: item.rerank_score, reverse=True)
        return updated, f"{self.reranker_provider.provider_name}:{self.reranker_provider.model_name}"
