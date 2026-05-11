from datetime import date
from pathlib import Path

from app.domain import ChunkRecord
from app.vector_store import ChromaStoreConfig, ChromaVectorStore


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


def test_chroma_vector_store_returns_expected_match(tmp_path: Path) -> None:
    store = ChromaVectorStore(
        ChromaStoreConfig(
            path=tmp_path / "chroma",
            collection_name="unit_test_chunks",
        )
    )
    store.replace_chunks(
        [
            ChunkRecord(
                chunk_id="chunk-1",
                note_id="note-1",
                title="Momentum reset",
                note_date=date(2026, 4, 10),
                content="Momentum comes back faster when I review an old note and pick one task.",
                chunk_index=0,
                embedding=[1.0, 0.0, 0.0],
                embedding_provider="fake-embed",
                embedding_model="unit-test",
            ),
            ChunkRecord(
                chunk_id="chunk-2",
                note_id="note-2",
                title="Workout planning",
                note_date=date(2026, 4, 11),
                content="Heavy lifts and progressive overload matter for training consistency.",
                chunk_index=0,
                embedding=[0.0, 1.0, 0.0],
                embedding_provider="fake-embed",
                embedding_model="unit-test",
            ),
        ]
    )

    results = store.semantic_search(
        "How do I recover momentum?",
        limit=2,
        embedding_provider=FakeEmbeddingProvider(),
    )

    assert results
    assert results[0].title == "Momentum reset"
    assert results[0].semantic_score > 0.9
