from pathlib import Path

from app.config import Settings
from app.providers import AnswerGenerationRequest, GeneratedAnswerBundle, RerankRequest, RerankResult
from app.repository import SQLiteRepository
from app.schemas import NoteCreate, QueryRequest
from app.service import KnowledgeService


class FakeEmbeddingProvider:
    provider_name = "fake-embed"
    model_name = "unit-test"

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            lowered = text.lower()
            vectors.append(
                [
                    1.0 if "momentum" in lowered else 0.0,
                    1.0 if "interview" in lowered else 0.0,
                    1.0 if "energy" in lowered else 0.0,
                ]
            )
        return vectors


class FakeAnswerProvider:
    provider_name = "fake-answer"
    model_name = "unit-test"

    def __init__(self) -> None:
        self.requests: list[AnswerGenerationRequest] = []

    def generate(self, request: AnswerGenerationRequest) -> GeneratedAnswerBundle:
        self.requests.append(request)
        return GeneratedAnswerBundle(
            answer=f"LLM::{request.question}",
            why_selected=f"LLM reason for {request.query_style}",
            suggested_actions=["LLM action"],
        )


class FakeRerankerProvider:
    provider_name = "fake-reranker"
    model_name = "unit-test"

    def __init__(self) -> None:
        self.requests: list[RerankRequest] = []

    def rerank(self, request: RerankRequest) -> list[RerankResult]:
        self.requests.append(request)
        results: list[RerankResult] = []
        for item in request.items:
            score = 0.2
            if "momentum" in item.title.lower() or "momentum" in item.content.lower():
                score = 0.92
            results.append(RerankResult(chunk_id=item.chunk_id, score=score))
        return results


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        app_name="Knowledge Copilot API",
        data_dir=tmp_path,
        database_path=tmp_path / "test.db",
        cors_origins=("http://localhost:3000",),
    )


def test_service_persists_embeddings_for_chunks(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    repository = SQLiteRepository(settings.database_path)
    service = KnowledgeService(
        repository,
        settings,
        embedding_provider=FakeEmbeddingProvider(),
    )

    service.create_note(
        NoteCreate(
            title="Momentum reset",
            content="Momentum comes back faster when I review an old note and pick one task to ship next.",
            note_date="2026-04-10",
            source_name="momentum.md",
        )
    )

    stored_chunks = repository.fetch_all_chunks()

    assert stored_chunks
    assert stored_chunks[0].embedding is not None
    assert stored_chunks[0].embedding_provider == "fake-embed"
    assert stored_chunks[0].embedding_model == "unit-test"


def test_service_uses_answer_provider_for_grounded_queries(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    repository = SQLiteRepository(settings.database_path)
    answer_provider = FakeAnswerProvider()
    service = KnowledgeService(
        repository,
        settings,
        answer_provider=answer_provider,
    )
    service.load_demo_notes()

    response, diagnostics = service.answer_question_with_diagnostics(
        QueryRequest(question="How do I win interview prep?", top_k=5)
    )

    assert response.answer == "LLM::How do I win interview prep?"
    assert response.why_selected == "LLM reason for action"
    assert response.suggested_actions == ["LLM action"]
    assert diagnostics.answer_provider == "fake-answer:unit-test"
    assert answer_provider.requests
    assert response.diagnostics is not None


def test_service_uses_reranker_provider_and_exposes_mode(tmp_path: Path) -> None:
    settings = _make_settings(tmp_path)
    repository = SQLiteRepository(settings.database_path)
    reranker_provider = FakeRerankerProvider()
    service = KnowledgeService(
        repository,
        settings,
        reranker_provider=reranker_provider,
    )
    service.load_demo_notes()

    response, diagnostics = service.answer_question_with_diagnostics(
        QueryRequest(question="How do I recover momentum?", top_k=5)
    )

    assert reranker_provider.requests
    assert diagnostics.reranker_mode == "fake-reranker:unit-test"
    assert diagnostics.rerank_latency_ms >= 0
    assert response.diagnostics is not None
    assert response.diagnostics.reranker_mode == "fake-reranker:unit-test"
