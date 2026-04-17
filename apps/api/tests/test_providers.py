from datetime import date

import httpx

from app.providers import (
    AnswerGenerationRequest,
    LocalAnswerProvider,
    OllamaRerankerProvider,
    OllamaAnswerProvider,
    OllamaEmbeddingProvider,
    OpenAIRerankerProvider,
    OpenAIAnswerProvider,
    OpenAIEmbeddingProvider,
    RerankItem,
    RerankRequest,
)
from app.schemas import Citation, RecurringTheme


def _generation_request() -> AnswerGenerationRequest:
    return AnswerGenerationRequest(
        question="What helps me recover momentum?",
        query_style="action",
        citations=[
            Citation(
                chunk_id="chunk-1",
                note_id="note-1",
                title="What helps me recover momentum",
                note_date=date(2026, 4, 1),
                excerpt="Old notes lower the activation energy.",
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
                representative_notes=["What helps me recover momentum", "Interview prep reset"],
            )
        ],
        fallback_answer="Use the routines that worked before.",
        fallback_why_selected="The same momentum notes keep surfacing.",
        fallback_actions=["Review the momentum note."],
    )


def test_local_answer_provider_returns_fallback_bundle() -> None:
    provider = LocalAnswerProvider()
    request = _generation_request()

    generated = provider.generate(request)

    assert generated.answer == request.fallback_answer
    assert generated.why_selected == request.fallback_why_selected
    assert generated.suggested_actions == request.fallback_actions


def test_openai_embedding_provider_parses_ordered_vectors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/embeddings")
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": 1, "embedding": [0.3, 0.4]},
                    {"index": 0, "embedding": [0.1, 0.2]},
                ]
            },
        )

    provider = OpenAIEmbeddingProvider(
        api_key="test-key",
        model_name="text-embedding-3-small",
        base_url="https://api.openai.com/v1",
        timeout_seconds=5,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    embeddings = provider.embed_texts(["first", "second"])

    assert embeddings == [[0.1, 0.2], [0.3, 0.4]]


def test_openai_answer_provider_parses_json_response() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "output_text": (
                    '{"answer":"Use old notes to restart faster.",'
                    '"why_selected":"The momentum note is a direct match.",'
                    '"suggested_actions":["Review the momentum note.","Write one next step."]}'
                )
            },
        )

    provider = OpenAIAnswerProvider(
        api_key="test-key",
        model_name="gpt-4.1-mini",
        base_url="https://api.openai.com/v1",
        timeout_seconds=5,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    generated = provider.generate(_generation_request())

    assert "restart faster" in generated.answer
    assert generated.suggested_actions[0] == "Review the momentum note."


def test_openai_reranker_provider_parses_json_scores() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "output_text": (
                    '{"results":['
                    '{"chunk_id":"chunk-1","score":0.91},'
                    '{"chunk_id":"chunk-2","score":0.12}'
                    ']}'
                )
            },
        )

    provider = OpenAIRerankerProvider(
        api_key="test-key",
        model_name="gpt-4.1-mini",
        base_url="https://api.openai.com/v1",
        timeout_seconds=5,
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )

    results = provider.rerank(
        RerankRequest(
            question="How do I recover momentum?",
            items=[
                RerankItem("chunk-1", "Momentum reset", "2026-04-01", "Old notes help.", 0.73),
                RerankItem("chunk-2", "Other", "2026-04-02", "Buy groceries.", 0.15),
            ],
        )
    )

    assert results[0].score == 0.91
    assert results[1].score == 0.12


def test_ollama_providers_support_embed_fallback_and_chat_output() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/embed":
            return httpx.Response(404, json={"error": "not found"})
        if request.url.path == "/api/embeddings":
            prompt = request.read().decode("utf-8")
            if "first" in prompt:
                return httpx.Response(200, json={"embedding": [0.1, 0.2]})
            return httpx.Response(200, json={"embedding": [0.3, 0.4]})
        if request.url.path == "/api/chat":
            body = request.read().decode("utf-8")
            if '"results"' in body or "chunk_id" in body:
                return httpx.Response(
                    200,
                    json={
                        "message": {
                            "content": (
                                '{"results":['
                                '{"chunk_id":"chunk-1","score":0.88},'
                                '{"chunk_id":"chunk-2","score":0.14}'
                                ']}'
                            )
                        }
                    },
                )
            return httpx.Response(
                200,
                json={
                    "message": {
                        "content": (
                            '{"answer":"Follow the clearest grounded step.",'
                            '"why_selected":"The note evidence is narrow and direct.",'
                            '"suggested_actions":["Pull one step from the note."]}'
                        )
                    }
                },
            )
        raise AssertionError(f"Unexpected path: {request.url.path}")

    client = httpx.Client(transport=httpx.MockTransport(handler))
    embedding_provider = OllamaEmbeddingProvider(
        model_name="nomic-embed-text",
        base_url="http://127.0.0.1:11434",
        timeout_seconds=5,
        http_client=client,
    )
    answer_provider = OllamaAnswerProvider(
        model_name="qwen3:8b",
        base_url="http://127.0.0.1:11434",
        timeout_seconds=5,
        http_client=client,
    )
    reranker_provider = OllamaRerankerProvider(
        model_name="qwen3:8b",
        base_url="http://127.0.0.1:11434",
        timeout_seconds=5,
        http_client=client,
    )

    embeddings = embedding_provider.embed_texts(["first", "second"])
    generated = answer_provider.generate(_generation_request())
    reranked = reranker_provider.rerank(
        RerankRequest(
            question="How do I recover momentum?",
            items=[
                RerankItem("chunk-1", "Momentum reset", "2026-04-01", "Old notes help.", 0.74),
                RerankItem("chunk-2", "Other", "2026-04-02", "Buy groceries.", 0.15),
            ],
        )
    )

    assert embeddings == [[0.1, 0.2], [0.3, 0.4]]
    assert generated.why_selected == "The note evidence is narrow and direct."
    assert reranked[0].score == 0.88
