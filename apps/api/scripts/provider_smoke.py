from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import Settings
from app.providers import build_answer_provider, build_embedding_provider, build_reranker_provider


def main() -> None:
    settings = Settings.from_env()
    report: dict[str, object] = {
        "embedding_provider": settings.embedding_provider,
        "answer_provider": settings.answer_provider,
        "reranker_provider": settings.reranker_provider,
        "checks": [],
    }

    embedding_provider = _safe_build(lambda: build_embedding_provider(settings), "embedding", report)
    answer_provider = _safe_build(lambda: build_answer_provider(settings), "answer", report)
    reranker_provider = _safe_build(lambda: build_reranker_provider(settings), "reranker", report)

    if embedding_provider is not None:
        report["checks"].append(_probe_embeddings(embedding_provider))
    if reranker_provider is not None:
        report["checks"].append(_probe_reranker(reranker_provider))
    if answer_provider is not None:
        report["checks"].append(_probe_answer(answer_provider))

    print(json.dumps(report, indent=2))


def _safe_build(factory, label: str, report: dict[str, object]):
    try:
        provider = factory()
    except Exception as error:
        report["checks"].append({"kind": label, "ok": False, "detail": str(error)})
        return None
    if provider is None:
        report["checks"].append({"kind": label, "ok": False, "detail": "provider disabled or local fallback"})
    return provider


def _probe_embeddings(provider) -> dict[str, object]:
    try:
        vectors = provider.embed_texts(["momentum reset", "interview prep"])
        dimensions = len(vectors[0]) if vectors and vectors[0] else 0
        return {
            "kind": "embedding",
            "ok": True,
            "provider": f"{provider.provider_name}:{provider.model_name}",
            "detail": f"returned {len(vectors)} vectors with dimension {dimensions}",
        }
    except Exception as error:
        return {
            "kind": "embedding",
            "ok": False,
            "provider": f"{provider.provider_name}:{provider.model_name}",
            "detail": str(error),
        }


def _probe_reranker(provider) -> dict[str, object]:
    from app.providers import RerankItem, RerankRequest

    try:
        results = provider.rerank(
            RerankRequest(
                question="How do I recover momentum?",
                items=[
                    RerankItem(
                        chunk_id="chunk-1",
                        title="Momentum reset",
                        note_date="2026-04-10",
                        content="Old notes lower the activation energy and help me restart quickly.",
                        current_score=0.74,
                    ),
                    RerankItem(
                        chunk_id="chunk-2",
                        title="Unrelated note",
                        note_date="2026-04-11",
                        content="I need to remember to buy groceries this weekend.",
                        current_score=0.18,
                    ),
                ],
            )
        )
        return {
            "kind": "reranker",
            "ok": True,
            "provider": f"{provider.provider_name}:{provider.model_name}",
            "detail": [f"{item.chunk_id}:{round(item.score, 3)}" for item in results],
        }
    except Exception as error:
        return {
            "kind": "reranker",
            "ok": False,
            "provider": f"{provider.provider_name}:{provider.model_name}",
            "detail": str(error),
        }


def _probe_answer(provider) -> dict[str, object]:
    from datetime import date

    from app.providers import AnswerGenerationRequest
    from app.schemas import Citation, RecurringTheme

    try:
        result = provider.generate(
            AnswerGenerationRequest(
                question="How do I recover momentum?",
                query_style="action",
                citations=[
                    Citation(
                        chunk_id="chunk-1",
                        note_id="note-1",
                        title="Momentum reset",
                        note_date=date(2026, 4, 10),
                        excerpt="Old notes lower the activation energy and help me restart quickly.",
                        reason="strong semantic match",
                        score=0.82,
                    )
                ],
                recurring_themes=[
                    RecurringTheme(
                        theme="Momentum",
                        note_count=2,
                        evidence_count=2,
                        summary="Momentum shows up across 2 notes.",
                        representative_notes=["Momentum reset", "Recovering momentum"],
                    )
                ],
                fallback_answer="Review one old note and take the next step immediately.",
                fallback_why_selected="The momentum note is a direct match.",
                fallback_actions=["Review the momentum note.", "Write one next step."],
            )
        )
        return {
            "kind": "answer",
            "ok": True,
            "provider": f"{provider.provider_name}:{provider.model_name}",
            "detail": result.answer,
        }
    except Exception as error:
        return {
            "kind": "answer",
            "ok": False,
            "provider": f"{provider.provider_name}:{provider.model_name}",
            "detail": str(error),
        }


if __name__ == "__main__":
    main()
