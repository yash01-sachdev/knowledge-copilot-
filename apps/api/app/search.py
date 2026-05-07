from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

from .domain import ChunkRecord, SearchCandidate
from .providers import EmbeddingProvider
from .text_utils import build_match_terms, clamp, extract_ranked_sentences, tokenize


@dataclass(frozen=True, slots=True)
class QueryProfile:
    is_pattern_query: bool
    is_action_query: bool
    wants_recent_bias: bool


def analyze_query(question: str) -> QueryProfile:
    lowered = question.lower()
    pattern_markers = {"pattern", "recurring", "repeat", "theme", "themes", "trend", "trends"}
    action_markers = {
        "how do i",
        "how can i",
        "how to",
        "what should",
        "should i",
        "what do i do",
        "next step",
        "next steps",
        "focus on",
        "help me decide",
        "move forward",
        "win",
        "succeed",
        "get unstuck",
    }
    recent_markers = {"recent", "lately", "last week", "last month", "this week", "this month"}
    return QueryProfile(
        is_pattern_query=any(marker in lowered for marker in pattern_markers),
        is_action_query=any(marker in lowered for marker in action_markers),
        wants_recent_bias=any(marker in lowered for marker in recent_markers),
    )


ACTION_ALIGNMENT_MARKERS = {
    "try",
    "start",
    "keep",
    "review",
    "focus",
    "return",
    "pick",
    "choose",
    "stop",
    "avoid",
    "define",
    "finish",
    "ship",
    "recover",
}

PATTERN_ALIGNMENT_MARKERS = {
    "pattern",
    "patterns",
    "repeat",
    "recurring",
    "usually",
    "trend",
    "trends",
    "consistently",
}


def _normalize_query_text(question: str) -> str:
    terms = build_match_terms(question)
    return " ".join(terms) if terms else question


def _build_query_phrases(question: str) -> set[str]:
    terms = build_match_terms(question)
    phrases: set[str] = set()
    for size in (2, 3):
        if len(terms) < size:
            continue
        for index in range(len(terms) - size + 1):
            phrases.add(" ".join(terms[index : index + size]))
    return phrases


def _phrase_match_score(text: str, phrases: set[str]) -> float:
    if not phrases:
        return 0.0
    normalized_text = " ".join(build_match_terms(text))
    matches = sum(1 for phrase in phrases if phrase in normalized_text)
    return matches / max(len(phrases), 1)


def _best_sentence_focus(text: str, query_terms: set[str], query_phrases: set[str]) -> float:
    best_score = 0.0
    for sentence in extract_ranked_sentences(text, query_terms, limit=3):
        sentence_terms = set(build_match_terms(sentence))
        overlap = len(sentence_terms & query_terms) / max(len(query_terms), 1)
        phrase_match = _phrase_match_score(sentence, query_phrases)
        best_score = max(best_score, (0.72 * overlap) + (0.28 * phrase_match))
    return best_score


def _has_alignment_marker(text: str, markers: set[str]) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in markers)


class HybridSearchEngine:
    def __init__(self) -> None:
        self.vectorizer: TfidfVectorizer | None = None
        self.reducer: TruncatedSVD | None = None
        self.matrix: np.ndarray | None = None
        self.embedding_matrix: np.ndarray | None = None
        self.chunks: list[ChunkRecord] = []

    def rebuild(self, chunks: list[ChunkRecord]) -> None:
        self.chunks = chunks
        self.vectorizer = None
        self.reducer = None
        self.matrix = None
        self.embedding_matrix = None
        if not chunks:
            return

        corpus = [f"{chunk.title}\n{chunk.content}" for chunk in chunks]
        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),
            max_features=12_000,
        )
        sparse = self.vectorizer.fit_transform(corpus)

        use_reducer = sparse.shape[0] >= 3 and sparse.shape[1] >= 3
        if use_reducer:
            components = min(64, sparse.shape[0] - 1, sparse.shape[1] - 1)
            if components >= 2:
                self.reducer = TruncatedSVD(n_components=components, random_state=42)
                dense = self.reducer.fit_transform(sparse)
            else:
                dense = sparse.toarray()
        else:
            dense = sparse.toarray()

        self.matrix = normalize(np.asarray(dense))

        embeddings = [chunk.embedding for chunk in chunks]
        if all(isinstance(embedding, list) and embedding for embedding in embeddings):
            dimensions = {len(embedding) for embedding in embeddings if embedding is not None}
            if len(dimensions) == 1:
                self.embedding_matrix = normalize(np.asarray(embeddings, dtype=float))

    def semantic_search(self, question: str, limit: int) -> list[SearchCandidate]:
        results, _ = self.semantic_search_with_mode(question, limit=limit)
        return results

    def semantic_search_with_mode(
        self,
        question: str,
        *,
        limit: int,
        embedding_provider: EmbeddingProvider | None = None,
    ) -> tuple[list[SearchCandidate], str]:
        embedding_results = self._provider_semantic_search(
            question,
            limit=limit,
            embedding_provider=embedding_provider,
        )
        if embedding_results is not None:
            return embedding_results, (
                f"{embedding_provider.provider_name}:{embedding_provider.model_name}"
                if embedding_provider is not None
                else "stored-embeddings"
            )

        return self._tfidf_semantic_search(question, limit=limit), "local-tfidf"

    def _tfidf_semantic_search(self, question: str, *, limit: int) -> list[SearchCandidate]:
        if not self.vectorizer or self.matrix is None or not self.chunks:
            return []

        query_matrix = self.vectorizer.transform([_normalize_query_text(question)])
        if self.reducer is not None:
            query_vector = self.reducer.transform(query_matrix)
        else:
            query_vector = query_matrix.toarray()

        normalized_query = normalize(np.asarray(query_vector))
        scores = np.dot(self.matrix, normalized_query[0])
        ranked_indexes = np.argsort(scores)[::-1][:limit]

        results: list[SearchCandidate] = []
        for index in ranked_indexes:
            raw_score = float(scores[index])
            semantic_score = clamp(raw_score, 0.0, 1.0)
            if semantic_score < 0.05:
                continue
            chunk = self.chunks[index]
            results.append(
                SearchCandidate(
                    chunk_id=chunk.chunk_id,
                    note_id=chunk.note_id,
                    title=chunk.title,
                    note_date=chunk.note_date,
                    content=chunk.content,
                    chunk_index=chunk.chunk_index,
                    embedding=chunk.embedding,
                    embedding_provider=chunk.embedding_provider,
                    embedding_model=chunk.embedding_model,
                    semantic_score=semantic_score,
                )
            )
        return results

    def _provider_semantic_search(
        self,
        question: str,
        *,
        limit: int,
        embedding_provider: EmbeddingProvider | None,
    ) -> list[SearchCandidate] | None:
        if embedding_provider is None or self.embedding_matrix is None or not self.chunks:
            return None

        query_embeddings = embedding_provider.embed_texts([_normalize_query_text(question)])
        if not query_embeddings or not query_embeddings[0]:
            return None

        query_vector = np.asarray([query_embeddings[0]], dtype=float)
        if query_vector.shape[1] != self.embedding_matrix.shape[1]:
            return None

        normalized_query = normalize(query_vector)
        scores = np.dot(self.embedding_matrix, normalized_query[0])
        ranked_indexes = np.argsort(scores)[::-1][:limit]

        results: list[SearchCandidate] = []
        for index in ranked_indexes:
            raw_score = float(scores[index])
            semantic_score = clamp(raw_score, 0.0, 1.0)
            if semantic_score < 0.05:
                continue
            chunk = self.chunks[index]
            results.append(
                SearchCandidate(
                    chunk_id=chunk.chunk_id,
                    note_id=chunk.note_id,
                    title=chunk.title,
                    note_date=chunk.note_date,
                    content=chunk.content,
                    chunk_index=chunk.chunk_index,
                    embedding=chunk.embedding,
                    embedding_provider=chunk.embedding_provider,
                    embedding_model=chunk.embedding_model,
                    semantic_score=semantic_score,
                )
            )
        return results


def merge_candidates(
    semantic_hits: list[SearchCandidate], keyword_hits: list[SearchCandidate]
) -> list[SearchCandidate]:
    merged: dict[str, SearchCandidate] = {}
    for candidate in semantic_hits + keyword_hits:
        existing = merged.get(candidate.chunk_id)
        if existing is None:
            merged[candidate.chunk_id] = candidate
            continue
        existing.semantic_score = max(existing.semantic_score, candidate.semantic_score)
        existing.keyword_score = max(existing.keyword_score, candidate.keyword_score)
    return list(merged.values())


def rerank_candidates(
    question: str,
    candidates: list[SearchCandidate],
    *,
    mode: str = "fast",
) -> list[SearchCandidate]:
    query_terms = set(build_match_terms(question))
    query_phrases = _build_query_phrases(question)
    profile = analyze_query(question)
    if not candidates:
        return []

    newest_note_date = max(candidate.note_date for candidate in candidates)
    oldest_note_date = min(candidate.note_date for candidate in candidates)
    date_span_days = max((newest_note_date - oldest_note_date).days, 1)

    for candidate in candidates:
        content_terms = set(build_match_terms(candidate.content))
        title_terms = set(tokenize(candidate.title))
        overlap = len(query_terms & content_terms) / max(len(query_terms), 1)
        title_overlap = len(query_terms & title_terms) / max(len(query_terms), 1)
        phrase_overlap = _phrase_match_score(f"{candidate.title}\n{candidate.content}", query_phrases)
        sentence_focus = _best_sentence_focus(candidate.content, query_terms, query_phrases)
        action_alignment = (
            1.0 if profile.is_action_query and _has_alignment_marker(candidate.content, ACTION_ALIGNMENT_MARKERS) else 0.0
        )
        pattern_alignment = (
            1.0 if profile.is_pattern_query and _has_alignment_marker(candidate.content, PATTERN_ALIGNMENT_MARKERS) else 0.0
        )
        recency = 0.0
        if profile.wants_recent_bias:
            recency = (candidate.note_date - oldest_note_date).days / date_span_days
        intent_alignment = max(action_alignment, pattern_alignment)

        if mode == "quality":
            candidate.rerank_score = clamp(
                (0.3 * candidate.semantic_score)
                + (0.16 * candidate.keyword_score)
                + (0.12 * overlap)
                + (0.08 * title_overlap)
                + (0.14 * phrase_overlap)
                + (0.14 * sentence_focus)
                + (0.04 * intent_alignment)
                + (0.02 * recency),
                0.0,
                1.0,
            )
        else:
            candidate.rerank_score = clamp(
                (0.36 * candidate.semantic_score)
                + (0.2 * candidate.keyword_score)
                + (0.14 * overlap)
                + (0.1 * title_overlap)
                + (0.1 * phrase_overlap)
                + (0.07 * sentence_focus)
                + (0.02 * intent_alignment)
                + (0.01 * recency),
                0.0,
                1.0,
            )

        reasons: list[str] = []
        if candidate.semantic_score >= 0.55:
            reasons.append("strong semantic match")
        if candidate.keyword_score >= 0.55:
            reasons.append("direct keyword overlap")
        if phrase_overlap >= 0.34:
            reasons.append("phrase match")
        if sentence_focus >= 0.42:
            reasons.append("direct sentence hit")
        if title_overlap > 0:
            reasons.append("title overlap")
        if action_alignment > 0:
            reasons.append("action cue")
        if pattern_alignment > 0:
            reasons.append("pattern cue")
        if profile.wants_recent_bias and recency > 0.65:
            reasons.append("recent note")
        candidate.reason = ", ".join(reasons) or "supporting context"

    return sorted(candidates, key=lambda item: item.rerank_score, reverse=True)
