from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Protocol

from chromadb import PersistentClient
from chromadb.api import ClientAPI

from .config import Settings
from .domain import ChunkRecord, SearchCandidate
from .providers import EmbeddingProvider
from .text_utils import build_match_terms, clamp


def _normalize_query_text(question: str) -> str:
    terms = build_match_terms(question)
    return " ".join(terms) if terms else question


class VectorStore(Protocol):
    store_name: str

    def replace_chunks(self, chunks: list[ChunkRecord]) -> None:
        ...

    def semantic_search(
        self,
        question: str,
        *,
        limit: int,
        embedding_provider: EmbeddingProvider,
    ) -> list[SearchCandidate]:
        ...


@dataclass(frozen=True, slots=True)
class ChromaStoreConfig:
    path: Path
    collection_name: str


class ChromaVectorStore:
    store_name = "chroma"

    def __init__(self, config: ChromaStoreConfig) -> None:
        self._config = config
        self._config.path.mkdir(parents=True, exist_ok=True)
        self._client: ClientAPI = PersistentClient(path=str(self._config.path))
        self._collection = self._client.get_or_create_collection(
            name=self._config.collection_name,
            metadata={"hnsw:space": "cosine"},
        )

    def replace_chunks(self, chunks: list[ChunkRecord]) -> None:
        collection = self._collection
        current_ids = set(collection.get(include=[])["ids"])
        vector_ready_chunks = [
            chunk
            for chunk in chunks
            if chunk.embedding is not None
            and chunk.embedding_provider is not None
            and chunk.embedding_model is not None
        ]
        incoming_ids = {chunk.chunk_id for chunk in vector_ready_chunks}
        stale_ids = list(current_ids - incoming_ids)
        if stale_ids:
            collection.delete(ids=stale_ids)
        if not vector_ready_chunks:
            return

        for batch_start in range(0, len(vector_ready_chunks), 100):
            batch = vector_ready_chunks[batch_start : batch_start + 100]
            collection.upsert(
                ids=[chunk.chunk_id for chunk in batch],
                documents=[chunk.content for chunk in batch],
                embeddings=[chunk.embedding for chunk in batch if chunk.embedding is not None],
                metadatas=[
                    {
                        "note_id": chunk.note_id,
                        "title": chunk.title,
                        "note_date": chunk.note_date.isoformat(),
                        "chunk_index": chunk.chunk_index,
                        "embedding_provider": chunk.embedding_provider,
                        "embedding_model": chunk.embedding_model,
                    }
                    for chunk in batch
                ],
            )

    def semantic_search(
        self,
        question: str,
        *,
        limit: int,
        embedding_provider: EmbeddingProvider,
    ) -> list[SearchCandidate]:
        query_embeddings = embedding_provider.embed_texts([_normalize_query_text(question)])
        if not query_embeddings or not query_embeddings[0]:
            return []

        result = self._collection.query(
            query_embeddings=query_embeddings,
            n_results=max(limit, 1),
            include=["documents", "metadatas", "distances"],
        )
        ids = result.get("ids", [[]])[0]
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]

        matches: list[SearchCandidate] = []
        for chunk_id, document, metadata, distance in zip(ids, documents, metadatas, distances, strict=False):
            if not isinstance(chunk_id, str) or not isinstance(document, str) or not isinstance(metadata, dict):
                continue
            semantic_score = clamp(1.0 - float(distance), 0.0, 1.0)
            if semantic_score < 0.05:
                continue
            note_date_raw = metadata.get("note_date")
            note_id = metadata.get("note_id")
            title = metadata.get("title")
            chunk_index = metadata.get("chunk_index")
            if not isinstance(note_date_raw, str) or not isinstance(note_id, str) or not isinstance(title, str):
                continue
            matches.append(
                SearchCandidate(
                    chunk_id=chunk_id,
                    note_id=note_id,
                    title=title,
                    note_date=date.fromisoformat(note_date_raw),
                    content=document,
                    chunk_index=int(chunk_index or 0),
                    embedding_provider=str(metadata.get("embedding_provider") or ""),
                    embedding_model=str(metadata.get("embedding_model") or ""),
                    semantic_score=semantic_score,
                )
            )
        return matches


def build_vector_store(settings: Settings) -> VectorStore | None:
    provider = settings.vector_store_provider.strip().lower()
    if provider in {"", "local", "none"}:
        return None
    if provider == "chroma":
        return ChromaVectorStore(
            ChromaStoreConfig(
                path=settings.chroma_path,
                collection_name=settings.chroma_collection_name,
            )
        )
    raise ValueError(f"Unsupported vector store provider: {settings.vector_store_provider}")
